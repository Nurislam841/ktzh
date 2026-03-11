import { Controller, Get, Post, Param, UploadedFile, UseInterceptors, Body, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { BindingImportService } from './binding-import.service';

@ApiTags('Binding Import')
@Controller('api/v1')
export class BindingImportController {
    constructor(private readonly importService: BindingImportService) { }

    @Post('files')
    @ApiOperation({ summary: 'Upload an XLSX file for binding import' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                fileType: { type: 'string', example: 'BindingPlan' },
                periodId: { type: 'string', example: '2026-03' },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { fileType?: string; periodId?: string },
    ) {
        if (!file) {
            return { error: 'No file uploaded' };
        }
        return this.importService.processFile(
            file.originalname,
            body.fileType ?? 'BindingPlan',
            body.periodId,
            file.buffer,
        );
    }

    @Get('batches/:fileId')
    @ApiOperation({ summary: 'Get file processing status' })
    async batchStatus(@Param('fileId') fileId: string) {
        return this.importService.getStatus(fileId);
    }

    @Get('validation/:fileId/errors')
    @ApiOperation({ summary: 'Get validation errors for a file' })
    async validationErrors(@Param('fileId') fileId: string) {
        return this.importService.getErrors(fileId);
    }
}
