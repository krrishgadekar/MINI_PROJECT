import { emitToMerchant } from '../realtime/socket';

export interface NotificationPayload {
  id?: string;
  groupId?: string;
  merchantId: string;
  merchantEmail?: string;
  merchantName?: string;
  type: string;
  message: string;
  refType?: string;
  refId?: string;
  createdAt?: Date;
}

export interface DeliveryChannel {
  name: 'inApp' | 'webhook' | 'emailStub';
  deliver(
    payload: NotificationPayload,
    options?: { webhookUrl?: string; email?: string }
  ): Promise<{ success: boolean; error?: string }>;
}

export class InAppDeliveryChannel implements DeliveryChannel {
  name: 'inApp' = 'inApp';

  async deliver(payload: NotificationPayload): Promise<{ success: boolean; error?: string }> {
    try {
      emitToMerchant(payload.merchantId, 'notification:new', {
        id: payload.id,
        groupId: payload.groupId,
        merchantId: payload.merchantId,
        type: payload.type,
        message: payload.message,
        refType: payload.refType,
        refId: payload.refId,
        readAt: null,
        createdAt: payload.createdAt || new Date(),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export class EmailStubDeliveryChannel implements DeliveryChannel {
  name: 'emailStub' = 'emailStub';
  public lastDeliveredEmail?: { to: string; subject: string; body: string };

  async deliver(
    payload: NotificationPayload,
    options?: { webhookUrl?: string; email?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const recipient = options?.email || payload.merchantEmail || `merchant-${payload.merchantId}@creditflow.local`;
      const subject = `[CreditFlow Alert] ${payload.type.replace(/[:_]/g, ' ').toUpperCase()}`;
      const body = `Hello,\n\nYou have a new notification on CreditFlow:\n${payload.message}\n\nTimestamp: ${payload.createdAt || new Date().toISOString()}`;

      this.lastDeliveredEmail = { to: recipient, subject, body };
      console.log(`📧 [EMAIL_STUB] To: ${recipient} | Subject: "${subject}" | Content: "${payload.message}"`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export class WebhookDeliveryChannel implements DeliveryChannel {
  name: 'webhook' = 'webhook';
  public lastDeliveredPayload?: any;

  async deliver(
    payload: NotificationPayload,
    options?: { webhookUrl?: string; email?: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (!options?.webhookUrl) {
      return { success: false, error: 'No webhook URL configured' };
    }

    try {
      this.lastDeliveredPayload = {
        event: 'notification',
        data: payload,
        deliveredAt: new Date().toISOString(),
      };
      console.log(`🔗 [WEBHOOK_STUB] Dispatched to ${options.webhookUrl} for event ${payload.type}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export class DeliveryService {
  private channels: Map<string, DeliveryChannel> = new Map();

  constructor() {
    this.registerChannel(new InAppDeliveryChannel());
    this.registerChannel(new EmailStubDeliveryChannel());
    this.registerChannel(new WebhookDeliveryChannel());
  }

  public registerChannel(channel: DeliveryChannel): void {
    this.channels.set(channel.name, channel);
  }

  public getChannel(name: string): DeliveryChannel | undefined {
    return this.channels.get(name);
  }

  public async dispatch(
    payload: NotificationPayload,
    preferences?: {
      channels?: { inApp?: boolean; email?: boolean; webhook?: boolean };
      webhookUrl?: string;
      email?: string;
    }
  ): Promise<Record<string, { success: boolean; error?: string }>> {
    const results: Record<string, { success: boolean; error?: string }> = {};

    const enableInApp = preferences?.channels?.inApp !== false; // default true
    const enableEmail = preferences?.channels?.email ?? true;   // default true
    const enableWebhook = preferences?.channels?.webhook ?? false; // default false

    if (enableInApp) {
      const inApp = this.channels.get('inApp');
      if (inApp) results.inApp = await inApp.deliver(payload);
    }

    if (enableEmail) {
      const emailChannel = this.channels.get('emailStub');
      if (emailChannel) {
        results.email = await emailChannel.deliver(payload, { email: preferences?.email });
      }
    }

    if (enableWebhook && preferences?.webhookUrl) {
      const webhookChannel = this.channels.get('webhook');
      if (webhookChannel) {
        results.webhook = await webhookChannel.deliver(payload, { webhookUrl: preferences.webhookUrl });
      }
    }

    return results;
  }
}

export const deliveryService = new DeliveryService();
