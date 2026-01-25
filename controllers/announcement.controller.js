import Announcement from '../models/announcement.model.js';

export const createAnnouncement = async (req, res) => {
    try {
        const { title, titleEn, content, contentEn, isMain, startDate, endDate, image, link } = req.body;
        const announcement = new Announcement({
            title,
            content,
            image,
            isMain,
            startDate,
            endDate,
            link
        });

    

        await announcement.save();
        res.status(201).json(announcement);
    } catch (error) {
        console.error("Error creating announcement:", error);
        res.status(500).json({ message: error.message });
    }
};

export const getAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.find({
            status: 'active',
            isMain: false,
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        })
            .sort({ createdAt: -1 });
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAnnouncementsForAdmin = async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ createdAt: -1 });
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getMainAnnouncement = async (req, res) => {
    try {
        const announcements = await Announcement.find({
            isMain: true,
            status: 'active',
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() }
        }).sort({ createdAt: -1 });


        // If no main announcements, respond with an empty array (200 OK)
        if (announcements.length === 0) {
            return res.json([]);
        }

        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// export const getAnnouncementById = async (req, res) => {
//     try {
//         const announcement = await Announcement.findById(req.params.id);

//         if (!announcement) {
//             return res.status(404).json({ message: 'Announcement not found' });
//         }

//         res.json(announcement);
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

export const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, titleEn, content, contentEn, isMain, startDate, endDate, status, image } = req.body;

     
        const updateData = {
            ...(title && { title }),
            ...(titleEn && { titleEn }),
            ...(content && { content }),
            ...(contentEn && { contentEn }),
            ...(image && { image }),
            ...(isMain && { isMain }),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
            ...(status && { status }),
            updatedAt: new Date()
        };
        // Allow multiple main announcements for carousel
        // if (isMain === 'true') {
        //     await Announcement.updateMany(
        //         { isMain: true, _id: { $ne: id } },
        //         { $set: { isMain: false } }
        //     );
        // }

        const updatedAnnouncement = await Announcement.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );

        if (!updatedAnnouncement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        res.json(updatedAnnouncement);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedAnnouncement = await Announcement.findByIdAndDelete(id);

        if (!deletedAnnouncement) {
            return res.status(404).json({ message: 'Announcement not found' });
        }

        res.json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};