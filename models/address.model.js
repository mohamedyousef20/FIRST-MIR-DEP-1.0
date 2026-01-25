import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
            index: true
        },

        state: { // المحافظة
            type: String,
            required: [true, 'State is required'],
            trim: true
        },

        city: { // المدينة
            type: String,
            required: [true, 'City is required'],
            trim: true
        },

        district: { // الحي / المنطقة
            type: String,
            required: [true, 'District is required'],
            trim: true
        },

        street: { // الشارع + رقم العمارة
            type: String,
            required: [true, 'Street is required'],
            trim: true
        },

        buildingNumber: { // رقم العمارة (اختياري لكن مهم)
            type: String,
            trim: true
        },

        apartmentNumber: { // رقم الشقة
            type: String,
            trim: true
        },

        landmark: { // علامة مميزة
            type: String,
            trim: true
        },


        label: { // Home / Work / Other
            type: String,
            enum: ['home', 'work', 'other'],
            default: 'home'
        },

        isDefault: { // العنوان الافتراضي
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);



// Ensure a user can only have one default address
addressSchema.pre('save', async function (next) {
    if (this.isDefault) {
        await this.constructor.updateMany(
            { user: this.user, _id: { $ne: this._id } },
            { $set: { isDefault: false } }
        );
    }
    next();
});

addressSchema.virtual('fullAddress').get(function () {
    return [
        this.state,
        this.city,
        this.district,
        this.street,
        this.buildingNumber && `عمارة ${this.buildingNumber}`,
        this.apartmentNumber && `شقة ${this.apartmentNumber}`,
        this.landmark && `علامة مميزة: ${this.landmark}`
    ]
        .filter(Boolean)
        .join('، ');
});

export default mongoose.model('Address', addressSchema);
