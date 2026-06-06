const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database... deleting all seeds and dummy data.');
  
  // Truncate tables (bottom-up to respect foreign keys)
  await prisma.notification.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.consumption.deleteMany();
  await prisma.glucoseReading.deleteMany();
  await prisma.user.deleteMany();
  await prisma.article.deleteMany();

  console.log('Database cleared. No users left.');

  console.log('Seeding official Health Articles...');

  const articles = [
    {
      title: 'Tips menjaga kadar gula darah tetap stabil sepanjang hari',
      category: 'kesehatan',
      timeLabel: 'Baru saja',
      imageUrl: 'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=500&q=80',
      author: 'Dr. Anisa Putri',
      date: '03 Agu 2025',
      body: `Menjaga kadar gula darah tetap stabil sepanjang hari merupakan kunci utama dalam mengelola kesehatan, terutama bagi penderita diabetes. Fluktuasi gula darah yang tajam dapat menyebabkan berbagai masalah kesehatan, mulai dari kelelahan hingga komplikasi serius.

Berikut adalah beberapa tips yang bisa Anda terapkan:

1. Konsumsi Makanan dengan Indeks Glikemik Rendah
Pilih makanan yang memiliki indeks glikemik rendah seperti sayuran hijau, kacang-kacangan, dan biji-bijian utuh. Makanan ini dicerna lebih lambat sehingga tidak menyebabkan lonjakan gula darah yang drastis.

2. Makan dalam Porsi Kecil tapi Sering
Daripada makan dalam porsi besar 3 kali sehari, cobalah makan dalam porsi kecil 5-6 kali sehari. Ini membantu menjaga kadar gula darah tetap stabil.

3. Jangan Lewatkan Sarapan
Sarapan pagi sangat penting untuk mengisi kembali energi setelah berpuasa semalaman. Pilih sarapan yang kaya serat dan protein untuk menjaga gula darah stabil hingga waktu makan siang.

4. Rutin Berolahraga
Aktivitas fisik membantu sel-sel tubuh menyerap glukosa lebih efisien. Olahraga ringan seperti jalan kaki 30 menit sehari sudah cukup untuk membantu mengontrol gula darah.

5. Kelola Stres dengan Baik
Stres dapat meningkatkan kadar gula darah melalui pelepasan hormon kortisol. Praktikkan teknik relaksasi seperti meditasi, yoga, atau pernapasan dalam untuk mengelola stres.`
    },
    {
      title: 'Olahraga ringan yang aman untuk penderita diabetes',
      category: 'olahraga',
      timeLabel: '2 hari lalu',
      imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=500&q=80',
      author: 'Dr. Budi Santoso',
      date: '02 Agu 2025',
      body: `Berolahraga secara teratur sangat penting bagi penderita diabetes. Namun, tidak semua jenis olahraga cocok untuk setiap orang. Berikut adalah beberapa olahraga ringan yang aman dan efektif.

1. Jalan Kaki
Jalan kaki adalah olahraga paling mudah dan aman. Mulailah dengan 15-20 menit per hari, kemudian tingkatkan secara bertahap hingga 30-45 menit. Jalan kaki membantu menurunkan kadar gula darah dan meningkatkan sensitivitas insulin.

2. Berenang
Berenang adalah olahraga low-impact yang sangat baik untuk penderita diabetes. Gerakan di air tidak membebani sendi dan membantu melatih seluruh otot tubuh secara merata.

3. Yoga
Yoga menggabungkan gerakan fisik dengan teknik pernapasan dan meditasi. Selain membantu mengontrol gula darah, yoga juga efektif mengurangi stres yang bisa memperburuk kondisi diabetes.

4. Bersepeda Santai
Bersepeda dengan intensitas ringan hingga sedang sangat baik untuk kesehatan kardiovaskular. Pilih rute yang datar dan hindari tanjakan yang terlalu curam.

5. Senam Ringan
Senam aerobik ringan atau senam diabetes dapat dilakukan di rumah. Gerakan-gerakan sederhana ini membantu meningkatkan sirkulasi darah dan metabolisme tubuh.`
    },
    {
      title: 'Makanan sehat yang membantu mengontrol glukosa darah',
      category: 'nutrisi',
      timeLabel: '3 hari lalu',
      imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=500&q=80',
      author: 'Dian Kurniati',
      date: '01 Agu 2025',
      body: `Dalam beberapa tahun terakhir, istilah seperti superfood, herbal remedy, dan functional food semakin populer. Banyak orang mulai percaya bahwa makanan tertentu bisa menyembuhkan penyakit, memperlambat penuaan dan meningkatkan daya tahan tubuh secara alami.

Namun, seberapa ilmiah anggapan ini? Apakah benar bahwa bahan-bahan alami seperti sayuran hijau, rempah, atau superfood eksotis memiliki efek penyembuhan nyata?

Di sinilah ilmu kimia pangan dan gizi fungsional memegang peran penting untuk membedakan antara klaim dan kenyataan. Secara sederhana, pangan fungsional adalah makanan yang tidak hanya memberikan energi dan zat gizi, tapi juga berkontribusi terhadap kesehatan di luar fungsi dasarnya.

Contohnya seperti yoghurt probiotik yang mendukung kesehatan pencernaan, kedelai yang mengandung isoflavon untuk menopausal support, atau teh hijau dan bayam yang kaya antioksidan.

Makanan yang baik untuk mengontrol glukosa darah antara lain:
• Sayuran hijau seperti bayam dan brokoli
• Kacang-kacangan dan biji-bijian
• Ikan berlemak seperti salmon
• Buah-buahan rendah gula seperti alpukat
• Bawang putih dan kunyit`
    },
    {
      title: 'Pentingnya kesehatan mental bagi penderita diabetes',
      category: 'kesehatan',
      timeLabel: '1 mgg lalu',
      imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500&q=80',
      author: 'Dr. Maya Sari',
      date: '31 Jul 2025',
      body: `Kesehatan mental merupakan aspek yang sering diabaikan dalam pengelolaan diabetes. Padahal, kondisi psikologis memiliki pengaruh besar terhadap kadar gula darah dan kualitas hidup secara keseluruhan.

Hubungan Diabetes dan Kesehatan Mental

Penderita diabetes memiliki risiko 2-3 kali lebih tinggi mengalami depresi dibandingkan populasi umum. Stres kronis akibat pengelolaan penyakit sehari-hari, kekhawatiran tentang komplikasi, dan perubahan gaya hidup yang diperlukan dapat membebani kesehatan mental.

Dampak Stres pada Gula Darah

Ketika seseorang mengalami stres, tubuh melepaskan hormon kortisol dan adrenalin yang meningkatkan kadar gula darah. Stres berkepanjangan dapat membuat pengelolaan diabetes menjadi lebih sulit.

Tips Menjaga Kesehatan Mental:

1. Bergabung dengan komunitas diabetes untuk mendapat dukungan sosial
2. Praktikkan mindfulness dan meditasi secara rutin
3. Jangan ragu berkonsultasi dengan psikolog atau konselor
4. Tetap aktif secara fisik untuk melepaskan endorfin
5. Tidur yang cukup dan berkualitas setiap malam
6. Luangkan waktu untuk hobi dan aktivitas yang menyenangkan`
    }
  ];

  await prisma.article.createMany({
    data: articles
  });

  console.log('Successfully inserted 4 articles!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
