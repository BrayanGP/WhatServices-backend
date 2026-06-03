require('./config/env');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./modules/users/user.model');
const Category = require('./modules/admin/category.model');

const DEFAULT_CATEGORIES = [
  { name: 'Carpinteros', slug: 'carpinteros', icon: '🪚' },
  { name: 'Plomeros', slug: 'plomeros', icon: '🔧' },
  { name: 'Herreros', slug: 'herreros', icon: '⚒️' },
  { name: 'Soldadores', slug: 'soldadores', icon: '🔦' },
  { name: 'Electricistas', slug: 'electricistas', icon: '⚡' },
  { name: 'Albañiles', slug: 'albaniles', icon: '🧱' },
  { name: 'Pintores', slug: 'pintores', icon: '🎨' },
  { name: 'Técnicos', slug: 'tecnicos', icon: '🔌' },
];

const seed = async () => {
  await connectDB();

  for (const cat of DEFAULT_CATEGORIES) {
    await Category.findOneAndUpdate({ slug: cat.slug }, cat, { upsert: true, new: true });
  }
  console.log(`✓ ${DEFAULT_CATEGORIES.length} categories seeded`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@whatservices.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin1234!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await User.findOneAndUpdate(
    { email: adminEmail },
    { name: 'Admin', email: adminEmail, passwordHash, role: 'admin' },
    { upsert: true, new: true }
  );
  console.log(`✓ Admin user: ${adminEmail} / ${adminPassword}`);

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
