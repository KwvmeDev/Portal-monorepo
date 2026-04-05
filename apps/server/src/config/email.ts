import nodemailer from 'nodemailer'
import { env } from './env'

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.GMAIL_USER,
    pass: env.GMAIL_APP_PASSWORD,
  },
})

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  await transporter.sendMail({
    from: `"PORTAL" <${env.GMAIL_USER}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })
}
