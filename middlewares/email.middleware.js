import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

// إنشاء transporter قابل لإعادة الاستخدام
let transporter = null;

// تكوين الـ transporter
const createTransporter = () => {
    // التحقق من إعدادات البريد الإلكتروني
    if (!config.email.enabled) {
        logger.warn("Email service is disabled");
        return null;
    }

    const emailConfig = {
        host: config.email.host,
        port: config.email.port || 587,
        secure: config.email.port === 465,
        auth: {
            user: config.email.user,
            pass: config.email.pass
        },
        // زيادة المهلة للخوادم البطيئة
        connectionTimeout: 10000, // 10 ثواني
        greetingTimeout: 10000,
        socketTimeout: 30000,

        // إعدادات TLS
        tls: {
            rejectUnauthorized: config.isProduction // في الإنتاج، نرفض الشهادات غير الموثوقة
        }
    };

    // إعدادات إضافية للـ STARTTLS
    if (config.email.port === 587) {
        emailConfig.secure = false;
        emailConfig.requireTLS = true;
    }

    logger.info("Email transporter configured", {
        host: config.email.host,
        port: config.email.port,
        user: config.email.user?.substring(0, 3) + '...'
    });

    return nodemailer.createTransport(emailConfig);
};

// الحصول على الـ transporter (إنشاء إذا لزم الأمر)
const getTransporter = () => {
    if (!transporter && config.email.enabled) {
        transporter = createTransporter();

        // التحقق من صحة الإعدادات
        if (transporter) {
            transporter.verify((error) => {
                if (error) {
                    logger.error("Email transporter verification failed", {
                        error: error.message
                    });
                } else {
                    logger.info("Email transporter is ready");
                }
            });
        }
    }
    return transporter;
};

// التحقق من صحة عنوان البريد الإلكتروني
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// إرسال البريد مع إعادة المحاولة
const sendEmailWithRetry = async (mailOptions, maxRetries = 3) => {
    const transporter = getTransporter();

    if (!transporter) {
        throw new Error("Email transporter is not available");
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);

            logger.info("Email sent successfully", {
                to: mailOptions.to,
                subject: mailOptions.subject,
                messageId: info.messageId,
                attempt
            });

            return {
                success: true,
                messageId: info.messageId,
                response: info.response,
                attempt
            };
        } catch (error) {
            lastError = error;

            logger.warn(`Email send attempt ${attempt} failed`, {
                to: mailOptions.to,
                subject: mailOptions.subject,
                error: error.message,
                attempt,
                maxRetries
            });

            // إذا كانت هذه المحاولة الأخيرة، لا تنتظر
            if (attempt === maxRetries) {
                break;
            }

            // الانتظار قبل إعادة المحاولة (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
};

// الدالة الرئيسية لإرسال البريد
const sendEmail = async (options) => {
    try {
        // التحقق من الخيارات المطلوبة
        if (!options || !options.email || !options.subject) {
            throw new Error("Email and subject are required");
        }

        // التحقق من صحة عنوان البريد الإلكتروني
        if (!isValidEmail(options.email)) {
            throw new Error(`Invalid email address: ${options.email}`);
        }

        // إذا كان البريد الإلكتروني غير مفعل، تسجيل وتحذير
        if (!config.email.enabled) {
            logger.warn("Email service is disabled, skipping email", {
                to: options.email,
                subject: options.subject
            });

            // في التطوير، طباعة محتوى البريد الإلكتروني
            if (config.isDevelopment) {
                console.log("📧 [DEV] Email would be sent:", {
                    to: options.email,
                    subject: options.subject,
                    html: options.html?.substring(0, 100) + '...'
                });
            }

            return {
                success: true,
                simulated: true,
                message: "Email service is disabled (simulated in development)"
            };
        }

        // إعداد خيارات البريد
        const mailOptions = {
            from: config.email.from || 'Mirvory Support Team <support@mirvory.com>',
            to: options.email,
            subject: options.subject,
            // استخدام HTML إذا كان متوفراً، وإلا استخدام النص العادي
            ...(options.html ? { html: options.html } : { text: options.message || '' })
        };

        // إضافة reply-to إذا كان متوفراً
        if (options.replyTo) {
            mailOptions.replyTo = options.replyTo;
        }

        // إضافة CC/BCC إذا كان متوفراً
        if (options.cc) {
            mailOptions.cc = options.cc;
        }

        if (options.bcc) {
            mailOptions.bcc = options.bcc;
        }

        // إضافة المرفقات إذا كانت متوفرة
        if (options.attachments && Array.isArray(options.attachments)) {
            mailOptions.attachments = options.attachments.map(attachment => ({
                filename: attachment.filename,
                content: attachment.content,
                contentType: attachment.contentType,
                encoding: 'base64'
            }));
        }

        // إضافة رؤوس مخصصة
        if (options.headers) {
            mailOptions.headers = options.headers;
        }

        // إرسال البريد مع إعادة المحاولة
        const result = await sendEmailWithRetry(mailOptions);

        return {
            success: true,
            messageId: result.messageId,
            attempt: result.attempt,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error("Email sending failed", {
            email: options?.email?.substring(0, 3) + '...',
            subject: options?.subject,
            error: error.message,
            stack: config.isDevelopment ? error.stack : undefined
        });

        return {
            success: false,
            error: config.isProduction
                ? "Failed to send email. Please try again later."
                : error.message,
            timestamp: new Date().toISOString()
        };
    }
};

// اختبار إرسال البريد الإلكتروني
export const testEmail = async (toEmail) => {
    try {
        const testOptions = {
            email: toEmail,
            subject: 'Test Email from Mirvory',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: center;">
          <h2 style="color: #1976D2;">Test Email</h2>
          <p>This is a test email sent from Mirvory backend system.</p>
          <p>If you received this email, your email configuration is working correctly.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>Environment:</strong> ${config.env}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `
        };

        const result = await sendEmail(testOptions);

        if (result.success) {
            logger.info("Test email sent successfully", { toEmail });
        } else {
            logger.error("Test email failed", { toEmail, error: result.error });
        }

        return result;
    } catch (error) {
        logger.error("Test email function failed", {
            toEmail,
            error: error.message
        });

        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

// الحصول على حالة خدمة البريد الإلكتروني
export const getEmailStatus = () => {
    const status = {
        enabled: config.email.enabled,
        configured: config.email.host && config.email.user && config.email.pass,
        host: config.email.host || 'Not configured',
        port: config.email.port || 'Not configured',
        user: config.email.user ? config.email.user.substring(0, 3) + '...' : 'Not configured',
        from: config.email.from || 'Not configured',
        transporterReady: transporter !== null,
        environment: config.env,
        timestamp: new Date().toISOString()
    };

    if (!status.enabled) {
        status.message = "Email service is disabled in configuration";
    } else if (!status.configured) {
        status.message = "Email service is not fully configured";
    } else if (!status.transporterReady) {
        status.message = "Email transporter is not initialized";
    } else {
        status.message = "Email service is ready";
    }

    return status;
};

// إرسال بريد تحقق متعدد اللغات
export const sendVerificationEmail = async (user, code, language = 'ar') => {
    const templates = {
        ar: {
            subject: 'تفعيل البريد الإلكتروني - Mirvory',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
          <h2 style="color: #1976D2;">تفعيل البريد الإلكتروني</h2>
          <p>مرحباً ${user.firstName}،</p>
          <p>استخدم الكود التالي لتفعيل بريدك الإلكتروني:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="color: #666; margin-top: 20px;">
            سيتم إلغاء صلاحية هذا الكود بعد 5 دقائق.<br>
            إذا لم تطلب هذا الكود، يرجى تجاهل هذا البريد.
          </p>
        </div>
      `
        },
        en: {
            subject: 'Email Verification - Mirvory',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: left;">
          <h2 style="color: #1976D2;">Email Verification</h2>
          <p>Hello ${user.firstName},</p>
          <p>Use the following code to verify your email:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="color: #666; margin-top: 20px;">
            This code will expire in 5 minutes.<br>
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      `
        }
    };

    const template = templates[language] || templates.ar;

    return sendEmail({
        email: user.email,
        subject: template.subject,
        html: template.html
    });
};

// إرسال بريد إعادة تعيين كلمة المرور
export const sendPasswordResetEmail = async (user, code, language = 'ar') => {
    const templates = {
        ar: {
            subject: 'إعادة تعيين كلمة المرور - Mirvory',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: right;">
          <h2 style="color: #1976D2;">إعادة تعيين كلمة المرور</h2>
          <p>مرحباً ${user.firstName}،</p>
          <p>لقد طلبت إعادة تعيين كلمة المرور. استخدم الكود التالي:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="color: #666; margin-top: 20px;">
            سيتم إلغاء صلاحية هذا الكود بعد 5 دقائق.<br>
            إذا لم تقم بطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.
          </p>
        </div>
      `
        },
        en: {
            subject: 'Password Reset - Mirvory',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; text-align: left;">
          <h2 style="color: #1976D2;">Password Reset</h2>
          <p>Hello ${user.firstName},</p>
          <p>You requested to reset your password. Use the following code:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F5F5F5; padding: 20px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="color: #666; margin-top: 20px;">
            This code will expire in 5 minutes.<br>
            If you didn't request a password reset, please ignore this email.
          </p>
        </div>
      `
        }
    };

    const template = templates[language] || templates.ar;

    return sendEmail({
        email: user.email,
        subject: template.subject,
        html: template.html
    });
};

export default sendEmail;