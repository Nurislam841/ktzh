import { BindingImportService } from './binding-import.service';

describe('BindingImportService', () => {
    let service: BindingImportService;
    let prisma: any;
    let mdm: any;
    let binding: any;

    beforeEach(() => {
        prisma = {
            inputFile: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation((args: any) =>
                    Promise.resolve({ id: 'file-1', ...args.data }),
                ),
                update: jest.fn().mockImplementation((args: any) =>
                    Promise.resolve({ id: args.where.id, ...args.data }),
                ),
            },
        };
        mdm = {
            resolveStationByCode: jest.fn().mockResolvedValue({ id: 'station-1', name: 'Test Station', code: 'TST' }),
            resolveTrainByNumber: jest.fn().mockResolvedValue({ id: 'train-1', number: '700' }),
            findModelBySeries: jest.fn().mockResolvedValue({ id: 'model-1', series: 'VL80' }),
        };
        binding = {
            upsertMany: jest.fn().mockResolvedValue([{ id: 'binding-1' }]),
        };
        service = new BindingImportService(prisma, mdm, binding);
    });

    it('detects duplicate file by checksum', async () => {
        prisma.inputFile.findUnique.mockResolvedValueOnce({
            id: 'existing-file',
            status: 'PROCESSED',
            checksum: 'abc',
        });

        const result = await service.processFile('test.xlsx', 'BindingPlan', '2026-03', Buffer.from('test'));
        expect(result.duplicate).toBe(true);
        expect(result.fileId).toBe('existing-file');
    });

    it('getStatus throws when file not found', async () => {
        prisma.inputFile.findUnique.mockResolvedValueOnce(null);
        await expect(service.getStatus('non-existent')).rejects.toThrow('File non-existent not found');
    });

    it('getErrors returns error details from file', async () => {
        const mockErrors = [
            { row: 2, field: 'arrival_dt', code: 'VALIDATION_ERROR', message: 'Invalid datetime' },
        ];
        prisma.inputFile.findUnique.mockResolvedValueOnce({
            id: 'file-1',
            errorDetails: mockErrors,
        });

        const result = await service.getErrors('file-1');
        expect(result.fileId).toBe('file-1');
        expect(result.errors).toEqual(mockErrors);
    });
});
