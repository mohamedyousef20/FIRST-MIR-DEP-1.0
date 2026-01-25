import PlatformEarnings from "../models/PlatformEarnings.model.js";
import mongoose from "mongoose";

// Get platform earnings by ID (with ownership check)
export const getPlatformEarningsById = async (req, res) => {
    try {
        const { id } = req.params;

        // Find platform earnings and ensure it belongs to the logged-in seller
        const platformEarnings = await PlatformEarnings.findOne({
            _id: id,
            sellerId: req.user._id
        }).populate('orderId').populate('sellerId');


        if (!platformEarnings) {
            return res.status(404).json({
                message: 'Platform earnings not found or you do not have permission to view these earnings'
            });
        }

        res.json(platformEarnings);
    } catch (err) {
        console.error('Get platform earnings by ID error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all platform earnings for a seller
export const getSellerPlatformEarnings = async (req, res) => {
    try {
        const { sellerId } = req.params;

        // Verify the logged-in user is requesting their own earnings
        if (sellerId !== req.user._id.toString()) {
            return res.status(403).json({
                message: 'You can only view your own earnings'
            });
        }

        const earnings = await PlatformEarnings.find({ sellerId })
            .populate('orderId')
            .populate('sellerId')
            .sort({ createdAt: -1 });

        res.json(earnings);
    } catch (err) {
        console.error('Get seller platform earnings error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create new platform earnings (admin only)
export const createPlatformEarnings = async (req, res) => {
    try {
        const { orderId, sellerId, commission, discountAmount, amount } = req.body;

        // Check if earnings record already exists for this order
        const existingEarnings = await PlatformEarnings.findOne({ orderId });
        if (existingEarnings) {
            return res.status(400).json({
                message: 'Platform earnings already exist for this order'
            });
        }

        const platformEarnings = new PlatformEarnings({
            orderId,
            sellerId,
            commission,
            discountAmount,
            amount
        });

        await platformEarnings.save();

        // Populate the saved document
        const populatedEarnings = await PlatformEarnings.findById(platformEarnings._id)
            .populate('orderId')
            .populate('sellerId');

        res.status(201).json(populatedEarnings);
    } catch (err) {
        console.error('Create platform earnings error:', err);

        if (err instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: err.errors
            });
        }

        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update platform earnings (admin only)
export const updatePlatformEarnings = async (req, res) => {
    try {
        const { id } = req.params;
        const { commission, discountAmount, amount } = req.body;

        const platformEarnings = await PlatformEarnings.findByIdAndUpdate(
            id,
            { commission, discountAmount, amount },
            { new: true, runValidators: true }
        ).populate('orderId').populate('sellerId');

        if (!platformEarnings) {
            return res.status(404).json({
                message: 'Platform earnings not found'
            });
        }

        res.json(platformEarnings);
    } catch (err) {
        console.error('Update platform earnings error:', err);

        if (err instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                message: 'Validation error',
                errors: err.errors
            });
        }

        res.status(500).json({ message: 'Internal server error' });
    }
};

// Delete platform earnings (admin only)
export const deletePlatformEarnings = async (req, res) => {
    try {
        const { id } = req.params;

        const platformEarnings = await PlatformEarnings.findByIdAndDelete(id);

        if (!platformEarnings) {
            return res.status(404).json({
                message: 'Platform earnings not found'
            });
        }

        res.json({ message: 'Platform earnings deleted successfully' });
    } catch (err) {
        console.error('Delete platform earnings error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get platform earnings summary for a seller
export const getSellerEarningsSummary = async (req, res) => {
    try {
        const { sellerId } = req.params;

        // Verify the logged-in user is requesting their own summary
        if (sellerId !== req.user._id.toString()) {
            return res.status(403).json({
                message: 'You can only view your own earnings summary'
            });
        }

        const summary = await PlatformEarnings.aggregate([
            { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
            {
                $group: {
                    _id: null,
                    totalCommission: { $sum: "$commission" },
                    totalAmount: { $sum: "$amount" },
                    totalRecords: { $sum: 1 }
                }
            }
        ]);

        const result = summary.length > 0 ? summary[0] : {
            totalCommission: 0,
            totalDiscounts: 0,
            totalAmount: 0,
            totalRecords: 0
        };

        res.json(result);
    } catch (err) {
        console.error('Get seller earnings summary error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get platform earnings summary
export const getPlatformEarningsSummary = async (req, res) => {
    try {
        const [overall] = await PlatformEarnings.aggregate([
            {
                $group: {
                    _id: null,
                    totalCommission: { $sum: "$commission" },
                    totalDiscounts: { $sum: "$discountAmount" },
                    totalAmount: { $sum: "$amount" },
                    totalRecords: { $sum: 1 }
                }
            }
        ]);
console.log([overall],'overall12')
        const monthly = await PlatformEarnings.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    amount: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 6 }
        ]);

        const formattedMonthly = monthly
            .map((item) => ({
                year: item._id.year,
                month: item._id.month,
                amount: item.amount
            }))
            .reverse();

        res.json({
            totalCommission: overall?.totalCommission || 0,
            totalDiscounts: overall?.totalDiscounts || 0,
            totalAmount: overall?.totalAmount || 0,
            totalRecords: overall?.totalRecords || 0,
            monthly: formattedMonthly
        });
    } catch (err) {
        console.error('Get platform earnings summary error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};