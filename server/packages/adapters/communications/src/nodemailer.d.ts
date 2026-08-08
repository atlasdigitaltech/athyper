// Ambient declaration for nodemailer (no @types/nodemailer installed).
declare module "nodemailer" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export interface TransportOptions { [key: string]: any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export interface SendMailOptions { [key: string]: any }
  export interface SentMessageInfo { messageId: string; [key: string]: unknown }
  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<SentMessageInfo>;
    verify(callback?: (err: Error | null, success: boolean) => void): Promise<boolean>;
    close(): void;
  }
  export function createTransport(options: TransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
