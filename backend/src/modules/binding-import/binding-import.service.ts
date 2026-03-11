import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MdmService } from '../mdm/mdm.service';
import { BindingService, BindingPlanDto } from '../binding/binding.service';
import { InputFileStatus, ConflictCode } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Expected columns in the canonical BindingPlan.xlsx template.
 */
const REQUIRED_COLUMNS = [
    'period_id',
    'turnaround_station_code',
    'arrival_train_no',
    'arrival_dt',
    'departure_train_no',
    'departure_dt',
];

const OPTIONAL_COLUMNS = ['required_series', 'shoulder_depot_code'];

export interface RowError {
    row: number;
    field: string;
    code: string; // ConflictCode value
    message: string;
}

@Injectable()
export class BindingImportService {
    private readonly logger = new Logger(BindingImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mdm: MdmService,
        private readonly binding: BindingService,
    ) { }

    /**
     * Process uploaded XLSX buffer: validate schema + rows, create InputFile + BindingPlan records.
     */
    async processFile(
        fileName: string,
        fileType: string,
        periodId: string | undefined,
        buffer: Buffer,
        uploadedBy?: string,
    ) {
        // Compute checksum for idempotency
        const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

        // Check for duplicate
        const existing = await this.prisma.inputFile.findUnique({ where: { checksum } });
        if (existing) {
            this.logger.warn(`File with checksum ${checksum} already uploaded as ${existing.id}`);
            return { fileId: existing.id, status: existing.status, duplicate: true };
        }

        // Create InputFile record
        const inputFile = await this.prisma.inputFile.create({
            data: {
                fileName,
                fileType,
                periodId: periodId ?? null,
                checksum,
                status: InputFileStatus.UPLOADED,
                uploadedBy: uploadedBy ?? null,
            },
        });

        // Parse XLSX
        let rows: Record<string, string>[];
        try {
            rows = await this.parseXlsx(buffer);
        } catch (err) {
            await this.prisma.inputFile.update({
                where: { id: inputFile.id },
                data: { status: InputFileStatus.FAILED, errorCount: 1, errorDetails: [{ row: 0, field: '', code: 'FORMAT_ERROR', message: String(err) }] },
            });
            return { fileId: inputFile.id, status: InputFileStatus.FAILED, errors: [{ row: 0, message: String(err) }] };
        }

        // Update status to VALIDATING
        await this.prisma.inputFile.update({
            where: { id: inputFile.id },
            data: { status: InputFileStatus.VALIDATING },
        });

        // Validate schema
        const schemaErrors = this.validateSchema(rows);
        if (schemaErrors.length > 0) {
            await this.prisma.inputFile.update({
                where: { id: inputFile.id },
                data: { status: InputFileStatus.FAILED, errorCount: schemaErrors.length, errorDetails: schemaErrors as any },
            });
            return { fileId: inputFile.id, status: InputFileStatus.FAILED, errors: schemaErrors };
        }

        // Validate rows and resolve references
        const { validDtos, errors } = await this.validateAndResolveRows(rows, inputFile.id);

        if (errors.length > 0 && validDtos.length === 0) {
            await this.prisma.inputFile.update({
                where: { id: inputFile.id },
                data: { status: InputFileStatus.FAILED, errorCount: errors.length, errorDetails: errors as any },
            });
            return { fileId: inputFile.id, status: InputFileStatus.FAILED, errors };
        }

        // Create binding plans for valid rows
        const created = await this.binding.upsertMany(validDtos);

        // Mark as VALIDATED (partial errors OK) or PROCESSED
        const finalStatus = errors.length > 0 ? InputFileStatus.VALIDATED : InputFileStatus.PROCESSED;
        await this.prisma.inputFile.update({
            where: { id: inputFile.id },
            data: {
                status: finalStatus,
                errorCount: errors.length,
                errorDetails: errors as any,
                processedAt: new Date(),
            },
        });

        return {
            fileId: inputFile.id,
            status: finalStatus,
            created: created.length,
            errors,
        };
    }

    /**
     * Get file processing status.
     */
    async getStatus(fileId: string) {
        const file = await this.prisma.inputFile.findUnique({ where: { id: fileId } });
        if (!file) throw new BadRequestException(`File ${fileId} not found`);
        return {
            fileId: file.id,
            fileName: file.fileName,
            status: file.status,
            errorCount: file.errorCount,
            uploadedAt: file.uploadedAt,
            processedAt: file.processedAt,
        };
    }

    /**
     * Get validation errors for a file.
     */
    async getErrors(fileId: string) {
        const file = await this.prisma.inputFile.findUnique({ where: { id: fileId } });
        if (!file) throw new BadRequestException(`File ${fileId} not found`);
        return { fileId: file.id, errors: file.errorDetails as unknown as RowError[] };
    }

    // ── Internal ──────────────────────────────────

    private async parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
        const XLSX = await this.loadXlsx();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('XLSX has no sheets');

        const sheet = workbook.Sheets[sheetName];
        const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (raw.length < 2) throw new Error('XLSX must have at least a header and one data row');

        // Build header map (normalize: lowercase, trim, replace spaces with underscores)
        const headers = (raw[0] as string[]).map((h) =>
            String(h).trim().toLowerCase().replace(/\s+/g, '_'),
        );

        // Map data rows to objects
        return raw.slice(1)
            .filter((row) => row.some((cell: any) => String(cell).trim() !== ''))
            .map((row) => {
                const obj: Record<string, string> = {};
                headers.forEach((h, i) => {
                    obj[h] = String(row[i] ?? '').trim();
                });
                return obj;
            });
    }

    private validateSchema(rows: Record<string, string>[]): RowError[] {
        if (rows.length === 0) return [{ row: 0, field: '', code: 'FORMAT_ERROR', message: 'No data rows found' }];

        const firstRow = rows[0];
        const presentColumns = Object.keys(firstRow);
        const missing = REQUIRED_COLUMNS.filter((c) => !presentColumns.includes(c));

        if (missing.length > 0) {
            return [{ row: 0, field: missing.join(','), code: 'FORMAT_ERROR', message: `Missing required columns: ${missing.join(', ')}` }];
        }

        return [];
    }

    private async validateAndResolveRows(
        rows: Record<string, string>[],
        sourceFileId: string,
    ): Promise<{ validDtos: BindingPlanDto[]; errors: RowError[] }> {
        const errors: RowError[] = [];
        const validDtos: BindingPlanDto[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // account for header row + 0-index
            const rowErrors: RowError[] = [];

            // Validate required fields are non-empty
            for (const col of REQUIRED_COLUMNS) {
                if (!row[col] || row[col].trim() === '') {
                    rowErrors.push({ row: rowNum, field: col, code: 'VALIDATION_ERROR', message: `${col} is required` });
                }
            }
            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
                continue;
            }

            // Validate & parse dates
            const arrivalDt = this.parseDate(row.arrival_dt);
            const departureDt = this.parseDate(row.departure_dt);

            if (!arrivalDt) {
                rowErrors.push({ row: rowNum, field: 'arrival_dt', code: 'VALIDATION_ERROR', message: `Invalid datetime: ${row.arrival_dt}` });
            }
            if (!departureDt) {
                rowErrors.push({ row: rowNum, field: 'departure_dt', code: 'VALIDATION_ERROR', message: `Invalid datetime: ${row.departure_dt}` });
            }
            if (arrivalDt && departureDt && departureDt <= arrivalDt) {
                rowErrors.push({ row: rowNum, field: 'departure_dt', code: 'VALIDATION_ERROR', message: 'departure_dt must be after arrival_dt' });
            }
            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
                continue;
            }

            // Resolve station
            const station = await this.mdm.resolveStationByCode(row.turnaround_station_code);
            if (!station) {
                rowErrors.push({ row: rowNum, field: 'turnaround_station_code', code: 'REF_NOT_FOUND', message: `Station not found: ${row.turnaround_station_code}` });
            }

            // Resolve trains
            const arrTrain = await this.mdm.resolveTrainByNumber(row.arrival_train_no);
            if (!arrTrain) {
                rowErrors.push({ row: rowNum, field: 'arrival_train_no', code: 'REF_NOT_FOUND', message: `Train not found: ${row.arrival_train_no}` });
            }

            const depTrain = await this.mdm.resolveTrainByNumber(row.departure_train_no);
            if (!depTrain) {
                rowErrors.push({ row: rowNum, field: 'departure_train_no', code: 'REF_NOT_FOUND', message: `Train not found: ${row.departure_train_no}` });
            }

            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
                continue;
            }

            // Resolve optional model
            let requiredModelId: string | undefined;
            if (row.required_series) {
                const model = await this.mdm.findModelBySeries(row.required_series);
                if (!model) {
                    rowErrors.push({ row: rowNum, field: 'required_series', code: 'REF_NOT_FOUND', message: `Series not found: ${row.required_series}` });
                } else {
                    requiredModelId = model.id;
                }
            }

            if (rowErrors.length > 0) {
                errors.push(...rowErrors);
                continue;
            }

            validDtos.push({
                periodId: row.period_id,
                turnaroundStationId: station!.id,
                arrivalTrainId: arrTrain!.id,
                arrivalDt: arrivalDt!.toISOString(),
                departureTrainId: depTrain!.id,
                departureDt: departureDt!.toISOString(),
                requiredModelId,
                sourceFileId,
            });
        }

        return { validDtos, errors };
    }

    private parseDate(value: string): Date | null {
        if (!value) return null;
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    private async loadXlsx() {
        return await import('xlsx');
    }
}
