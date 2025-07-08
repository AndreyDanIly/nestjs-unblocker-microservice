import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { UnblockerService } from './unblocker.service';
import { UnblockRequestDto } from './dto/unblock-request.dto';

@Controller('unblock')
export class UnblockerController {
    constructor(private readonly unblockerService: UnblockerService) {}

    @Post()
    async unblockWebsite(
        @Body() unblockRequestDto: UnblockRequestDto,
        @Res() res: Response,
    ) {
        const { html, status } = await this.unblockerService.getPageContent(
            unblockRequestDto.url,
        );

        res.setHeader('Content-Type', 'text/html');
        res.status(status).send(html);
    }
}