import { baseSchema, Joi, patterns } from './base.schema.js';

// Create complaint schema
const complaintSchema = baseSchema.keys({
    user: Joi.string().pattern(patterns.objectId).required(),
    order: Joi.string().pattern(patterns.objectId).allow(null),
    title: Joi.string().min(3).max(100).required(),
    message: Joi.string().min(10).max(1000).required(),
    images: Joi.array().items(Joi.string()).max(5).default([]),
    status: Joi.string().valid('open', 'in_progress', 'resolved').default('open')
});

// Update complaint schema
const updateComplaintSchema = baseSchema.keys({
    title: Joi.string().min(3).max(100),
    message: Joi.string().min(10).max(1000),
    images: Joi.array().items(Joi.string()).max(5),
    status: Joi.string().valid('open', 'in_progress', 'resolved')
}).min(1); // يجب تحديث حقل واحد على الأقل

// Complaint response/reply schema
const complaintResponseSchema = baseSchema.keys({
    message: Joi.string().min(1).max(500).required(),
    adminId: Joi.string().pattern(patterns.objectId).required(),
    attachments: Joi.array().items(Joi.string()).max(3).default([])
});

// Filter complaints schema (for querying)
const filterComplaintsSchema = Joi.object({
    user: Joi.string().pattern(patterns.objectId),
    order: Joi.string().pattern(patterns.objectId),
    status: Joi.string().valid('open', 'in_progress', 'resolved'),
    fromDate: Joi.date(),
    toDate: Joi.date(),
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'title').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Validate create complaint
export const validateComplaint = (data) => {
    const schema = Joi.object({
        order: Joi.string().pattern(patterns.objectId).allow(null, ''),
        title: Joi.string().min(3).max(100).required(),
        message: Joi.string().min(10).max(1000).required(),
        images: Joi.array().items(Joi.string().uri()).max(5).default([])
    });

    return schema.validate(data, { abortEarly: false });
};

// Validate update complaint
export const validateUpdateComplaint = (data) => {
    const schema = Joi.object({
        title: Joi.string().min(3).max(100),
        message: Joi.string().min(10).max(1000),
        images: Joi.array().items(Joi.string().uri()).max(5),
        status: Joi.string().valid('open', 'in_progress', 'resolved')
    }).min(1);

    return schema.validate(data, { abortEarly: false });
};

// Validate complaint response
export const validateComplaintResponse = (data) => {
    const schema = Joi.object({
        message: Joi.string().min(1).max(500).required(),
        attachments: Joi.array().items(Joi.string().uri()).max(3).default([])
    });

    return schema.validate(data, { abortEarly: false });
};

// Validate complaint filters
export const validateComplaintFilters = (data) => {
    const schema = Joi.object({
        user: Joi.string().pattern(patterns.objectId),
        order: Joi.string().pattern(patterns.objectId),
        status: Joi.string().valid('open', 'in_progress', 'resolved'),
        fromDate: Joi.date(),
        toDate: Joi.date().when('fromDate', {
            is: Joi.exist(),
            then: Joi.date().min(Joi.ref('fromDate'))
        }),
        search: Joi.string().allow(''),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().valid('createdAt', 'updatedAt', 'title').default('createdAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    });

    return schema.validate(data, { abortEarly: false });
};

// Validate complaint ID
export const validateComplaintId = (id) => {
    return Joi.string().pattern(patterns.objectId).required().validate(id);
};

// Validate image URLs in complaint
export const validateComplaintImages = (images) => {
    const schema = Joi.array().items(
        Joi.string().uri({
            scheme: ['http', 'https']
        }).max(500)
    ).max(5);

    return schema.validate(images);
};

// Validate complaint status transition
export const validateStatusTransition = (currentStatus, newStatus) => {
    const allowedTransitions = {
        'open': ['in_progress', 'resolved'],
        'in_progress': ['resolved', 'open'],
        'resolved': ['open'] 
    };

    return allowedTransitions[currentStatus]?.includes(newStatus) || false;
};

// Export schemas
export {
    complaintSchema,
    updateComplaintSchema,
    complaintResponseSchema,
    filterComplaintsSchema
};