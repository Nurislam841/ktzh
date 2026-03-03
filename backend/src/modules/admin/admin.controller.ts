import { Controller, Post, Headers, HttpCode } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiHeader } from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Post('seed')
    @HttpCode(200)
    async seed(@Headers('x-admin-token') token: string) {
        return this.adminService.seed(token);
    }
}
