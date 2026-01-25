import Complaint from '../models/complaint.model.js';
import { sendNotification } from '../utils/notify.js';

export const createComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.create({
      user: req.user._id,
      order: req.body.orderId || undefined,
      title: req.body.title,
      message: req.body.message,
      images: req.body.images,
    });

    // notify admins
    const io = req.app.get('io');
    if (io) {
      try {
        const admins = await User.find({ role: 'admin', isActive: true }).select('_id');

        await Promise.all(
          admins.map((admin) =>
            sendNotification(io, {
              user: admin._id,
              role: 'admin',
              title: 'شكوى جديدة',
              message: `${req.user.firstName}تم تقديم شكوى جديدة من العميل`,
              type: 'COMPLAINT_SUBMITTED',
              actor: req.user._id,
              data: { userId: req.user._id },
              is_read: false
            })
          )
        );
      } catch (err) {
        console.error('Failed to notify admins about new complaint:', err.message);
      }
    }

    res.status(201).json({ success: true, data: complaint });
  } catch (err) {
    console.error('Create complaint error', err);
    res.status(500).json({ message: 'خطأ في إنشاء الشكوى' });
  }
};

export const getComplaints = async (req, res) => {
  try {
    const user = req.user._id;
    const { skip, limit } = res.locals.pagination;

    const total = await Complaint.countDocuments({ user });

    const complaints = await Complaint.find({ user })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ success: true, data: complaints, pagination: res.locals.buildLinks(total) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'فشل في جلب الشكاوى' });
  }
};

export const getComplaintsForAdmin = async (req, res) => {
  try {
    // Pagination handled by middleware
    const { skip, limit } = res.locals.pagination;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Complaint.countDocuments(filter),
    ]);

    res.json({ success: true, data: complaints, pagination: res.locals.buildLinks(total) });
  } catch (err) {
    console.error('Admin complaints fetch error', err);
    res.status(500).json({ message: 'فشل في جلب الشكاوى' });
  }
};

export const getComplaint = async (req, res) => {
  try {
    const c = await Complaint.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'غير موجود' });
    if (req.user.role !== 'admin' && c.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'غير مصرح' });
    }
    res.json({ success: true, data: c });
  } catch (err) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.body;
    const { status } = req.body;

    // Validate status
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'حالة غير صالحة' });
    }

    // Check if complaint exists
    const complaint = await Complaint.findById(id).populate('user', 'firstName lastName');
    if (!complaint) {
      return res.status(404).json({ message: 'الشكوى غير موجودة' });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'غير مصرح - يحتاج صلاحية مدير' });
    }

    // Update status
    const oldStatus = complaint.status;
    complaint.status = status;
    await complaint.save();

    // Send notification to user about status change
    const io = req.app.get('io');
    if (io) {
      try {
        await sendNotification(io, {
          user: complaint.user._id,
          role: 'user',
          title: 'تحديث حالة الشكوى',
          message: `تم تحديث حالة شكواك "${complaint.title}" من ${oldStatus} إلى ${status}`,
          type: 'COMPLAINT_STATUS_UPDATED',
          actor: req.user._id,
          data: {
            complaintId: complaint._id,
            oldStatus,
            newStatus: status
          },
          is_read: false
        });
      } catch (err) {
        console.error('Failed to send notification to user:', err.message);
      }
    }

    res.json({
      success: true,
      data: complaint,
      message: 'تم تحديث حالة الشكوى بنجاح'
    });
  } catch (err) {
    console.error('Update complaint status error', err);
    res.status(500).json({ message: 'خطأ في تحديث حالة الشكوى' });
  }
};

export const deleteComplaint = async (req, res) => {
  try {
    const { id } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: 'غير موجود' });
    }

    const isOwner = complaint.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    // المستخدم العادي لا يستطيع حذف شكوى مغلقة
    if (!isAdmin && complaint.status === 'resolved') {
      return res.status(400).json({ message: 'لا يمكن حذف شكوى مغلقة' });
    }

    await complaint.deleteOne();
    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: 'خطأ' });
  }
};

export const updateComplaint = async (req, res) => {
  try {
    const { id, updates } = req.body;

    // Check if complaint exists
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: 'الشكوى غير موجودة' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && complaint.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'غير مصرح' });
    }

    // Regular users can only update their own complaints if status is open
    if (req.user.role !== 'admin') {
      if (complaint.status !== 'open') {
        return res.status(400).json({ message: 'لا يمكن تعديل شكوى مغلقة أو قيد المعالجة' });
      }
      // Users can only update specific fields
      const allowedFields = ['title', 'message', 'images'];
      Object.keys(updates).forEach(key => {
        if (!allowedFields.includes(key)) {
          delete updates[key];
        }
      });
    }

    // Update the complaint
    const updatedComplaint = await Complaint.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedComplaint,
      message: 'تم تحديث الشكوى بنجاح'
    });
  } catch (err) {
    console.error('Update complaint error', err);
    res.status(500).json({ message: 'خطأ في تحديث الشكوى' });
  }
};