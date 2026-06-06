import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { LobbyService } from './lobby.service.js';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  RoomDetail,
  RoomSummary,
  SetReadyRequest,
} from '@bgf/shared-types';

interface AuthedRequest extends Request {
  user: { sub: string; username: string };
}

/**
 * REST surface for lobby/matchmaking. JWT-protected; tokens are minted by
 * auth-service and validated here via the same JWT_SECRET (shared via env).
 */
@Controller('lobby')
@UseGuards(AuthGuard('jwt'))
export class LobbyController {
  constructor(private readonly lobby: LobbyService) {}

  @Get('rooms')
  list(): Promise<ReadonlyArray<RoomSummary>> {
    return this.lobby.listRooms();
  }

  @Get('rooms/:id')
  get(@Param('id') id: string): Promise<RoomDetail> {
    return this.lobby.getRoom(id);
  }

  @Post('rooms')
  create(@Req() req: AuthedRequest, @Body() body: CreateRoomRequest): Promise<RoomDetail> {
    return this.lobby.createRoom(req.user.sub, req.user.username, body);
  }

  @Post('rooms/join')
  join(@Req() req: AuthedRequest, @Body() body: JoinRoomRequest): Promise<RoomDetail> {
    return this.lobby.joinRoom(req.user.sub, req.user.username, body.roomId);
  }

  @Post('rooms/:id/ready')
  ready(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: SetReadyRequest): Promise<RoomDetail> {
    return this.lobby.setReady(req.user.sub, id, body.ready);
  }

  @Post('rooms/:id/start')
  start(@Req() req: AuthedRequest, @Param('id') id: string): Promise<RoomDetail> {
    return this.lobby.startGame(req.user.sub, id);
  }

  @Post('rooms/:id/leave')
  @HttpCode(204)
  leave(@Req() req: AuthedRequest, @Param('id') id: string): Promise<void> {
    return this.lobby.leaveRoom(req.user.sub, id);
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  close(@Req() req: AuthedRequest, @Param('id') id: string): Promise<void> {
    return this.lobby.closeRoom(req.user.sub, id);
  }
}
