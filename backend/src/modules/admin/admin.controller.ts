import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags } from '@nestjs/swagger';
import { ImportDataDto, SeedOptionsDto } from './dto/seed-options.dto';

@ApiTags('Администрирование')
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Post('seed')
    @HttpCode(200)
    async seed(@Headers('x-admin-token') token: string, @Body() dto: SeedOptionsDto) {
        return this.adminService.seed(token, dto);
    }

    @Post('import-data')
    @HttpCode(200)
    async importData(@Headers('x-admin-token') token: string, @Body() dto: ImportDataDto) {
        return this.adminService.importData(token, dto?.dataDir);
    }

    @Post('bootstrap-ops')
    @HttpCode(200)
    async bootstrapOps(@Headers('x-admin-token') token: string) {
        return this.adminService.bootstrapOperationalData(token);
    }

    @Post('import-bootstrap')
    @HttpCode(200)
    async importAndBootstrap(@Headers('x-admin-token') token: string, @Body() dto: ImportDataDto) {
        return this.adminService.importAndBootstrap(token, dto?.dataDir);
    }
}
