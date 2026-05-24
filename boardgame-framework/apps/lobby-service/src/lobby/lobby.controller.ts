import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LobbyService } from './lobby.service.js';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  RoomDetail,
  RoomSummary,
  SetReadyRequest,
} from '@bgf/shared-types';

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
  create(@Body() body: CreateRoomRequest): Promise<RoomDetail> {
    // TODO: pull userId from request after wiring an @CurrentUser() decorator
    return this.lobby.createRoom('TODO-userId', body);
  }

  @Post('rooms/join')
  join(@Body() body: JoinRoomRequest): Promise<RoomDetail> {
    return this.lobby.joinRoom('TODO-userId', body.roomId);
  }

  @Post('rooms/:id/ready')
  ready(@Param('id') id: string, @Body() body: SetReadyRequest): Promise<RoomDetail> {
    return this.lobby.setReady('TODO-userId', id, body.ready);
  }

  @Post('rooms/:id/start')
  start(@Param('id') id: string): Promise<RoomDetail> {
    return this.lobby.startGame('TODO-userId', id);
  }
}
