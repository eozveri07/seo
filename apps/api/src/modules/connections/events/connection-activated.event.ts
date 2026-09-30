import { ConnectionType } from '../entities/connection.entity';

/** `connection.activated` event adı; `EventEmitter2` üzerinden yayılır. */
export const CONNECTION_ACTIVATED_EVENT = 'connection.activated';

/** T1.5: GSC backfill'i bu event ile başlar. */
export class ConnectionActivatedEvent {
  constructor(
    public readonly connectionId: string,
    public readonly orgId: string,
    public readonly projectId: string,
    public readonly type: ConnectionType,
  ) {}
}
