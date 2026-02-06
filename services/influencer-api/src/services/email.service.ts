import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { compile } from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  context: any;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private templates: Map<string, any> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
    this.loadTemplates();
  }

  private initializeTransporter() {
    const emailConfig = {
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    };

    this.transporter = nodemailer.createTransport(emailConfig);
  }

  private loadTemplates() {
    const templatesDir = join(__dirname, '..', 'templates', 'email');
    
    // Load email templates
    const templates = [
      'influencer-verification',
      'influencer-welcome',
      'staking-notification',
      'reward-claimed',
      'tier-upgrade',
    ];

    templates.forEach(templateName => {
      try {
        const templatePath = join(templatesDir, `${templateName}.hbs`);
        const templateContent = readFileSync(templatePath, 'utf-8');
        this.templates.set(templateName, compile(templateContent));
      } catch (error) {
        this.logger.warn(`Failed to load template ${templateName}`);
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const template = this.templates.get(options.template);
      if (!template) {
        throw new Error(`Email template ${options.template} not found`);
      }

      const html = template(options.context);

      const mailOptions = {
        from: this.configService.get('SMTP_FROM', 'Twist Platform <noreply@twist.to>'),
        to: options.to,
        subject: options.subject,
        html,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${options.to}: ${result.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      throw error;
    }
  }

  async sendBulkEmails(recipients: string[], subject: string, template: string, context: any): Promise<void> {
    const promises = recipients.map(to => 
      this.sendEmail({ to, subject, template, context })
        .catch(error => {
          this.logger.error(`Failed to send bulk email to ${to}`, error);
        })
    );

    await Promise.all(promises);
  }
}