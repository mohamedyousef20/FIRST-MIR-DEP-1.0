// import { Worker } from "bullmq";
// import { redisConfig } from "./redis.js";
// import User from "../models/user.model.js";
// import Notification from "../models/notification.model.js";


// const worker = new Worker(
//     "notifications",
//     async job => {
//         const { title, message, role, link } = job.data;

//         const admins = await User.find({ role });

//         const bulkData = admins.map(a => ({
//             userId: a._id,
//             role,
//             title,
//             message,
//             link,
//             type: "NEW_REGISTRATION",
//         }));

//         await Notification.insertMany(bulkData);

//         return { count: bulkData.length };
//     },
//     { connection: redisConfig }
// );

// worker.on("completed", (job) => {
//     //console.log(`Notification Job #${job.id} completed`);
// });

// worker.on("failed", (job, err) => {
//     console.error(`Notification Job #${job?.id} failed:`, err);
// });
