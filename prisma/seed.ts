import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const products = [
    { name: 'Lugaw', tier: 'Kumpleto', price: 50.00 },
    { name: 'Lugaw', tier: 'With Egg', price: 35.00 },
    { name: 'Lugaw', tier: 'Plain', price: 15.00 },
    { name: 'Lomi', tier: 'Big', price: 200.00 },
    { name: 'Lomi', tier: 'Small', price: 120.00 },
    { name: 'Nachos', tier: null, price: 99.00 },
    { name: 'Sizzling Hotdog', tier: null, price: 150.00 },
    { name: 'Fries', tier: null, price: 50.00 },
    { name: 'Cheesesticks', tier: null, price: 50.00 },
    { name: 'Lumpia Shanghai', tier: null, price: 50.00 },
  ]

  console.log('Start seeding...')
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: {
        name_tier: {
          name: p.name,
          tier: p.tier || '', // Prisma sqlite composite unique where null is tricky, let's adjust schema to default tier to empty string or handle it
        }
      },
      update: {},
      create: {
        name: p.name,
        tier: p.tier || '',
        price: p.price,
      },
    })
    console.log(`Created product with id: ${product.product_id}`)
  }
  console.log('Seeding finished.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
