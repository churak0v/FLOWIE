
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCTS = [
    {
        name: "Наслаждение",
        price: 5428,
        image: "https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&q=80&w=600",
        description: "7 розовых роз, веточки эвкалипта, розовая упаковка, темная атласная лента",
        tags: "Хит",
        deliveryTime: "45 мин"
    },
    {
        name: "Нежность",
        price: 3924,
        image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&q=80&w=600",
        description: "Нежный букет из смешанных цветов",
        tags: "",
        deliveryTime: "35 мин"
    },
    {
        name: "Полёт",
        price: 7625,
        image: "https://images.unsplash.com/photo-1572454591674-2739f30d8c40?auto=format&fit=crop&q=80&w=600",
        description: "Премиальный большой букет",
        tags: "",
        deliveryTime: "50 мин"
    }
];

async function main() {
    console.log('Start seeding ...');
    for (const p of PRODUCTS) {
        const product = await prisma.product.create({
            data: p,
        });
        console.log(`Created product with id: ${product.id}`);
    }
    console.log('Seeding finished.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
