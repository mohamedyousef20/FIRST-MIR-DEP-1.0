import Joi from 'joi';
console.log('🔄 auth.validations.js: تحميل ملف التحقق من الصحة');

// Helper validation functions
const egyptianPhoneRegex = /^01[0125][0-9]{8}$/;
const passwordRegex = /^[\w\u0600-\u06FF]{8,}$/;
const nationalIdRegex = /^\d{14}$/;

export const registerValidation = Joi.object({
    firstName: Joi.string()
        .min(2)
        .max(50)
        .required()
        .messages({
            'string.min': 'First name must be at least 2 characters',
            'string.max': 'First name cannot exceed 50 characters',
            'any.required': 'First name is required'
        }),
    lastName: Joi.string()
        .min(2)
        .max(50)
        .required()
        .messages({
            'string.min': 'Last name must be at least 2 characters',
            'string.max': 'Last name cannot exceed 50 characters',
            'any.required': 'Last name is required'
        }),
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .min(8)
        .regex(passwordRegex)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            'any.required': 'Password is required'
        }),
    phone: Joi.string()
        .pattern(egyptianPhoneRegex)
        .optional()
        .messages({
            'string.pattern.base': 'Please provide a valid Egyptian phone number (01XXXXXXXXX)'
        }),
    role: Joi.string()
        .valid('user', 'seller')
        .default('user')
        .messages({
            'any.only': 'Role must be either user or seller'
        }),
    vendorProfile: Joi.object({
        storeName: Joi.string()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.min': 'Store name must be at least 2 characters',
                'string.max': 'Store name cannot exceed 100 characters',
                'any.required': 'Store name is required'
            }),
        ownerName: Joi.string()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.min': 'Owner name must be at least 2 characters',
                'string.max': 'Owner name cannot exceed 100 characters',
                'any.required': 'Owner name is required'
            }),
        phone: Joi.string()
            .pattern(egyptianPhoneRegex)
            .required()
            .messages({
                'string.pattern.base': 'Please provide a valid Egyptian phone number (01XXXXXXXXX)',
                'any.required': 'Store phone number is required'
            }),
        nationalId: Joi.string()
            .pattern(nationalIdRegex)
            .required()
            .messages({
                'string.pattern.base': 'Please provide a valid 14-digit national ID',
                'any.required': 'National ID is required'
            }),
        city: Joi.string()
            .min(2)
            .max(50)
            .required()
            .messages({
                'string.min': 'City must be at least 2 characters',
                'string.max': 'City cannot exceed 50 characters',
                'any.required': 'City is required'
            }),
        payoutMethod: Joi.string()
            .valid('instapay', 'bank_transfer', 'vodafone_cash', 'etisalat_cash', 'orange_cash', 'we_cash')
            .required()
            .messages({
                'any.only': 'Payout method must be one of: instapay, bank_transfer, vodafone_cash, etisalat_cash, orange_cash, we_cash',
                'any.required': 'Payout method is required'
            }),
        payoutAccount: Joi.string()
            .min(1)
            .max(50)
            .required()
            .messages({
                'string.min': 'Payout account must be at least 1 character',
                'string.max': 'Payout account cannot exceed 50 characters',
                'any.required': 'Payout account is required'
            })
    }).when('role', {
        is: 'seller',
        then: Joi.required(),
        otherwise: Joi.optional()
    }).messages({
        'any.required': 'Vendor profile is required for sellers',
        'object.base': 'Vendor profile must be an object'
    })
}); 

export const loginValidation = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .messages({
            'any.required': 'Password is required'
        })
});

export const updateProfileValidation = Joi.object({
    firstName: Joi.string()
        .min(2)
        .max(50)
        .optional()
        .messages({
            'string.min': 'First name must be at least 2 characters',
            'string.max': 'First name cannot exceed 50 characters'
        }),
    lastName: Joi.string()
        .min(2)
        .max(50)
        .optional()
        .messages({
            'string.min': 'Last name must be at least 2 characters',
            'string.max': 'Last name cannot exceed 50 characters'
        }),
    phone: Joi.string()
        .pattern(egyptianPhoneRegex)
        .optional()
        .messages({
            'string.pattern.base': 'Please provide a valid Egyptian phone number (01XXXXXXXXX)'
        })
}).min(1).messages({
    'object.min': 'At least one field must be provided for update'
});

export const emailValidation = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        })
});

export const verifyEmailValidation = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    code: Joi.string()
        .length(6)
        .pattern(/^\d+$/)
        .required()
        .messages({
            'string.length': 'Verification code must be 6 digits',
            'string.pattern.base': 'Verification code must contain only digits',
            'any.required': 'Verification code is required'
        })
});

export const resetCodeValidation = Joi.object({
    code: Joi.string()
        .length(6)
        .pattern(/^\d+$/)
        .required()
        .messages({
            'string.length': 'Reset code must be 6 digits',
            'string.pattern.base': 'Reset code must contain only digits',
            'any.required': 'Reset code is required'
        })
});

export const resetPasswordValidation = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    newPassword: Joi.string()
        .min(8)
        .regex(passwordRegex)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            'any.required': 'New password is required'
        })
});

export const changePasswordValidation = Joi.object({
    currentPassword: Joi.string()
        .required()
        .messages({
            'any.required': 'Current password is required'
        }),
    newPassword: Joi.string()
        .min(8)
        .regex(passwordRegex)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            'any.required': 'New password is required'
        }),
    confirmPassword: Joi.string()
        .valid(Joi.ref('newPassword'))
        .required()
        .messages({
            'any.only': 'Passwords do not match',
            'any.required': 'Please confirm your password'
        })
});

export const googleAuthValidation = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    googleId: Joi.string()
        .required()
        .messages({
            'any.required': 'Google ID is required'
        }),
    firstName: Joi.string()
        .min(2)
        .max(50)
        .optional(),
    lastName: Joi.string()
        .min(2)
        .max(50)
        .optional(),
    avatar: Joi.string()
        .uri()
        .optional()
        .messages({
            'string.uri': 'Avatar must be a valid URL'
        })
});

export const vendorProfileValidation = Joi.object({
    storeName: Joi.string()
        .min(2)
        .max(100)
        .required()
        .trim()
        .messages({
            'string.min': 'Store name must be at least 2 characters',
            'string.max': 'Store name cannot exceed 100 characters',
            'any.required': 'Store name is required'
        }),

    ownerName: Joi.string()
        .min(2)
        .max(100)
        .required()
        .trim()
        .messages({
            'string.min': 'Owner name must be at least 2 characters',
            'string.max': 'Owner name cannot exceed 100 characters',
            'any.required': 'Owner name is required'
        }),

    phone: Joi.string()
        .pattern(/^01[0125][0-9]{8}$/)
        .required()
        .trim()
        .messages({
            'string.pattern.base': 'Please provide a valid Egyptian phone number (01XXXXXXXXX)',
            'any.required': 'Phone number is required'
        }),

    nationalId: Joi.string()
        .length(14)
        .required()
        .trim()
        .messages({
            'string.length': 'National ID must be exactly 14 characters',
            'any.required': 'National ID is required'
        }),

    city: Joi.string()
        .trim()
        .optional()
        .allow('', null),

    payoutMethod: Joi.string()
        .valid('instapay', 'vodafone_cash', 'bank')
        .required()
        .messages({
            'any.only': 'Payout method must be instapay, vodafone_cash, or bank',
            'any.required': 'Payout method is required'
        }),

});

// Validation middleware
export const validate = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    // Replace request body with validated data
    req.body = value;
    next();
};