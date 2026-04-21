db = db.getSiblingDB('cxmi');
db.users.insertOne({
    email: 'admin@example.com',
    password: '$2a$10$WPH1Fks3QbVE.FuIjeC0Y.5V.mAk8Zbooz.J8RTnNqXvRv5m1xWx2', // admin123 bcrypt hash
    displayName: 'Platform Admin',
    role: 'platform_admin',
    status: 'active',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
});
