import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const vendorSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    ownerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^01[0125][0-9]{8}$/ 
    },

    nationalId: {
      type: String,
      required: true,
      trim: true,
      minlength: 14,
      maxlength: 14
    },

    city: {
      type: String,
      trim: true
    },

    payoutMethod: {
      type: String,
      enum: ['instapay', 'vodafone_cash', 'bank'],
      required: true
    },

    payoutAccount: {
      type: String,
      required: true,
      trim: true
    },


    isNewSeller: {
      type: Boolean,
      default: true
    },

    isApproved: {
      type: Boolean,
      default: false
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    totalOrders: {
      type: Number,
      default: 0
    },

  },
  { _id: false }
);

const walletSchema = new mongoose.Schema({
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'EGP'
  },
  lastTransaction: {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    amount: Number,
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'sale', 'refund', 'commission']
    },
    date: Date
  },
  pendingBalance: {
    type: Number,
    default: 0
  },
  availableBalance: {
    type: Number,
    default: 0
  },
  pendingTransactions: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    releaseDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'released', 'cancelled'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    releasedAt: Date
  }],
  transactionHistory: [{
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'sale', 'refund', 'commission']
    },
    amount: Number,
    description: String,
    reference: String,
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['completed', 'pending', 'failed'],
      default: 'completed'
    }
  }]
}, { _id: false });

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    minlength: 2
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    minlength: 2
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format'],
    index: true
  },
  provider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  avatar: {
    type: String,
    validate: {
      validator: v => !v || v.startsWith('http'),
      message: 'Avatar must be a valid URL'
    }
  },
  password: {
    type: String,
    required: function () {
      return this.provider === 'local';
    },
    minlength: 8,
    select: false
  },
  passwordChangeAt: Date,

  role: {
    type: String,
    enum: ['admin', 'seller', 'user', 'delivery', 'moderator'],
    default: 'user',
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Automatic blocking flag (e.g. too many return requests)
  isBlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  // Indicates whether the admin has marked this seller as trusted
  isTrustedSeller: {
    type: Boolean,
    default: false,
    index: true
  },
  vendorProfile: vendorSchema,
  wallet: {
    type: walletSchema,
    default: () => ({})
  },
  addresses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Address'
  }],
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    validate: {
      validator: v => !v || /^01[0125][0-9]{8}$/.test(v),
      message: props => `${props.value} is not a valid Egyptian phone number!`
    },
    index: true
  },
  verificationCode: {
    type: String,
    select: false
  },
  verificationCodeExpires: {
    type: Date,
  },
  passwordResetCode: {
    type: String,
  },
  passwordResetExpires: {
    type: Date,
  },
  passwordResetVerified: {
    type: Boolean,
    default: false,
    select: false
  },

  lastLogin: Date,
  loginHistory: [{
    timestamp: Date,
    success: Boolean
  }],

  preferences: {
    language: {
      type: String,
      default: 'ar',
      enum: ['ar', 'en']
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: ['EGP', 'USD', 'EUR']
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    lastPasswordChange: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: Date
  },
  metadata: {
    registrationSource: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    },
    registrationIP: String,
    lastActive: Date,
    timezone: { type: String, default: 'Africa/Cairo' }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      // Remove sensitive fields
      delete ret.password;
      delete ret.verificationCode;
      delete ret.passwordResetCode;
      delete ret.security?.twoFactorSecret;
      delete ret.passwordHistory;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.verificationCode;
      delete ret.passwordResetCode;
      delete ret.security?.twoFactorSecret;
      delete ret.passwordHistory;
      return ret;
    }
  }
});

// Password hashing middleware
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    // Store password in history (keep last 5 passwords)
    if (this.passwordHistory) {
      this.passwordHistory.push({
        password: this.password,
        changedAt: new Date()
      });

      // Keep only last 5 passwords
      if (this.passwordHistory.length > 5) {
        this.passwordHistory = this.passwordHistory.slice(-5);
      }
    }

    // Update password change timestamp
    this.passwordChangeAt = new Date();
    this.security.lastPasswordChange = new Date();

    next();
  } catch (error) {
    next(error);
  }
});

// Update timestamps on certain operations
userSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if password was used recently
userSchema.methods.wasPasswordUsedRecently = async function (newPassword) {
  if (!this.passwordHistory || this.passwordHistory.length === 0) {
    return false;
  }

  for (const record of this.passwordHistory) {
    const isMatch = await bcrypt.compare(newPassword, record.password);
    if (isMatch) {
      return true;
    }
  }

  return false;
};

// Update vendor balance method
userSchema.methods.updateVendorBalance = async function (
  amount,
  transactionType,
  metadata = {}
) {
  if (this.role !== 'seller') {
    throw new Error('Balance updates are only allowed for vendors');
  }

  const CREDIT_TYPES = ['sale', 'deposit'];
  const DEBIT_TYPES = ['withdrawal', 'refund', 'commission'];

  if (![...CREDIT_TYPES, ...DEBIT_TYPES].includes(transactionType)) {
    throw new Error('Invalid transaction type');
  }

  if (!this.wallet) {
    this.wallet = {};
  }

  if (DEBIT_TYPES.includes(transactionType) && this.wallet.balance < amount) {
    throw new Error('Insufficient funds');
  }

  const newBalance = CREDIT_TYPES.includes(transactionType)
    ? this.wallet.balance + amount
    : this.wallet.balance - amount;

  this.wallet.balance = newBalance;

  this.wallet.lastTransaction = {
    amount,
    type: transactionType,
    date: new Date(),
    ...metadata
  };

  this.wallet.transactionHistory = this.wallet.transactionHistory || [];

  this.wallet.transactionHistory.push({
    type: transactionType,
    amount,
    description: metadata.description || transactionType,
    reference:
      metadata.reference ||
      `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    status: 'completed'
  });

  if (this.wallet.transactionHistory.length > 100) {
    this.wallet.transactionHistory =
      this.wallet.transactionHistory.slice(-100);
  }

  await this.save();
  return this.wallet.balance;
};

// Add login attempt tracking
userSchema.methods.recordLoginAttempt = async function (success, ip, userAgent, device = 'unknown') {
  if (!this.loginHistory) {
    this.loginHistory = [];
  }

  this.loginHistory.push({
    ipAddress: ip,
    device,
    userAgent,
    timestamp: new Date(),
    success
  });

  // Keep only last 50 login attempts
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50);
  }

  // Update failed login attempts counter
  if (!success) {
    this.security.failedLoginAttempts = (this.security.failedLoginAttempts || 0) + 1;

    // Lock account after 5 failed attempts for 15 minutes
    if (this.security.failedLoginAttempts >= 5) {
      this.security.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  } else {
    // Reset failed attempts on successful login
    this.security.failedLoginAttempts = 0;
    this.security.accountLockedUntil = null;
    this.lastLogin = new Date();
  }

  await this.save();
};

// Check if account is locked
userSchema.methods.isAccountLocked = function () {
  if (this.security.accountLockedUntil) {
    return this.security.accountLockedUntil > new Date();
  }
  return false;
};

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  if (!this.firstName && !this.lastName) {
    return this.email;
  }
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtual for display name (first name only or email)
userSchema.virtual('displayName').get(function () {
  return this.firstName || this.email.split('@')[0];
});

// Virtual for account age
userSchema.virtual('accountAge').get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Static method to find by email (case insensitive)
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: new RegExp(`^${email}$`, 'i') });
};

// Static method to get active sellers
userSchema.statics.getActiveSellers = function () {
  return this.find({
    role: 'seller',
    isActive: true,
    'vendorProfile.storeName': { $exists: true }
  });
};

// Indexes for better query performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 }, {
  unique: true,
  sparse: true,
  partialFilterExpression: { phone: { $exists: true, $ne: null } }
});
userSchema.index({ 'vendorProfile.storeName': 'text' });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ 'security.accountLockedUntil': 1 });
userSchema.index({ 'metadata.registrationIP': 1 });

export default mongoose.model('User', userSchema);