import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const GARMENT_TYPES = [
  "Wedding Gown",
  "Bridesmaid Dress",
  "Evening Gown / Formal Dress",
  "Suit Jacket",
  "Suit Pants",
  "Tuxedo Jacket",
  "Tuxedo Pants",
  "Vest",
  "Shirt / Blouse",
  "Skirt",
  "Flower Girl Dress",
  "Other",
];

const ALTERATION_TYPES = [
  "Hem",
  "Take In",
  "Let Out",
  "Bustle",
  "Shorten Sleeves",
  "Lengthen Sleeves",
  "Adjust Straps",
  "Take In Bodice",
  "Add/Replace Buttons",
  "Add/Replace Zipper",
  "Cuff Adjustment",
  "Taper Pants",
  "Waist Adjustment",
  "Re-Line",
  "Bead/Lace Repair",
  "Press/Steam Only",
  "Custom (see notes)",
];

async function main() {
  const managerPassword = process.env.SEED_MANAGER_PASSWORD || "changeme123!";
  const managerEmail = process.env.SEED_MANAGER_EMAIL || "manager@justforyoualterations.com";

  const existing = await prisma.user.findUnique({ where: { email: managerEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: "Shop Manager",
        role: "MANAGER",
        email: managerEmail,
        passwordHash: await bcrypt.hash(managerPassword, 10),
        active: true,
      },
    });
    console.log(`Created manager account: ${managerEmail} / ${managerPassword}`);
    console.log("⚠️  Log in and change this password immediately in a real deployment.");
  } else {
    console.log(`Manager account ${managerEmail} already exists, skipping.`);
  }

  for (let i = 0; i < GARMENT_TYPES.length; i++) {
    await prisma.garmentTypeOption.upsert({
      where: { label: GARMENT_TYPES[i] },
      update: {},
      create: { label: GARMENT_TYPES[i], sortOrder: i },
    });
  }

  for (let i = 0; i < ALTERATION_TYPES.length; i++) {
    await prisma.alterationTypeOption.upsert({
      where: { label: ALTERATION_TYPES[i] },
      update: {},
      create: { label: ALTERATION_TYPES[i], sortOrder: i },
    });
  }

  await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, lastNumber: 0 },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
