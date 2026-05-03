const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const FLOWWOW_FLOWERS = [
  {
    name: "Newton Chrysanthemum & Dianthus Hatbox",
    price: 56,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/67/1729887997_73691467.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/67/1729887997_73691467.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/48/1729887997_91797048.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/74/1729887998_34929774.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/85/1729887998_96967485.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1729887998_60557421.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/69/1729887998_58483869.jpg"
    ],
  },
  {
    name: "French Rose, Hydrangea & Matthiola Bouquet",
    price: 68,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1702308642_80855500.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1702308642_80855500.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/81/1702308642_43486281.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/61/1702308643_44944761.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/07/1702308643_46730607.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/47/1702308643_51268647.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/06/1702308643_29854006.jpg"
    ],
  },
  {
    name: "Spray Roses & Dianthus with Eucalyptus",
    price: 53,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1765550523_55984951.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1765550523_55984951.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/44/1765550523_67361044.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/31/1765550524_78770231.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1765550524_26488221.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/88/1765550524_63017088.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/31/1765550524_38738231.jpg"
    ],
  },
  {
    name: "French Roses, Newton Chrysanthemum & Eucalyptus Bouquet",
    price: 66,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1760619735_22318705.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1760619735_22318705.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/41/1760619682_47724041.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1760619682_84007040.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1760619682_28413477.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/63/1760619682_47265263.jpg"
    ],
  },
  {
    name: "Coral Peonies with Eucalyptus",
    price: 79,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/52/1749001492_85309952.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/52/1749001492_85309952.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1749001492_84330057.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/70/1749001492_58574270.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/89/1749001493_88099489.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/80/1749001493_77631580.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/93/1749001493_67903593.jpg"
    ],
  },
  {
    name: "Hydrangea, Daisy Chrysanthemum & Chamomile Bouquet",
    price: 59,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1751745549_96371221.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1751745549_96371221.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/39/1751745549_55562239.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/69/1751745549_15683369.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/42/1751745549_34466842.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1751745550_71396979.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/64/1751745550_25600464.jpg"
    ],
  },
  {
    name: "Spray Roses & Lisianthus Author Bouquet",
    price: 56,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1765551870_26838092.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1765551870_26838092.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1765551870_39640350.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/95/1765551870_11586595.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/16/1765551871_68817216.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1765551871_99861005.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/12/1765551871_96367512.jpg"
    ],
  },
  {
    name: "White Newton Chrysanthemum & Eucalyptus Bouquet",
    price: 64,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/59/1713451463_48509959.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/59/1713451463_48509959.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/04/1713451463_85641504.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/74/1713451463_58115474.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/46/1713451463_47275746.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/12/1713451463_16850912.jpg"
    ],
  },
  {
    name: "White Peonies with Eucalyptus",
    price: 69,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/82/1777635782_33595582.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/82/1777635782_33595582.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/81/1777635783_71109081.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/33/1777635784_52663033.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/43/1777635786_27067743.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1777635787_53873692.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/31/1777635789_55353231.jpg"
    ],
  },
  {
    name: "Pastel French Roses with Eucalyptus",
    price: 98,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1738940936_10500777.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1738940936_10500777.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/66/1738940937_43712466.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/84/1738940937_61287484.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/73/1738940938_77952773.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/72/1738940938_96407772.jpg"
    ],
  },
  {
    name: "Sarah Bernhardt Peonies, 11 Stems",
    price: 142,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1750693330_26737051.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1750693330_26737051.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1750693330_46736157.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/30/1750693330_17607230.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/47/1750693331_71955047.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/95/1750693331_26604495.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/03/1750693331_92653103.jpg"
    ],
  },
  {
    name: "Hydrangea, Dianthus, Spray Roses & Chrysanthemums Bouquet",
    price: 91,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/96/1751732114_71144296.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/96/1751732114_71144296.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/95/1751732114_16872895.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/71/1751732114_84779471.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/88/1751732115_6858188.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/31/1751732115_63986931.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/20/1751732115_38053420.jpg"
    ],
  },
  {
    name: "Matthiola, Dianthus & Altai Chrysanthemum Basket",
    price: 203,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/53/1758073801_13576653.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/53/1758073801_13576653.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1758073801_98482492.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1758073801_60826800.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/29/1758073801_76045429.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1758073802_75366199.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/29/1758073802_14180829.jpg"
    ],
  },
  {
    name: "Coral Peony Roses with Eucalyptus",
    price: 100,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1777648976_65072650.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1777648976_65072650.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/35/1777648976_39500235.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/20/1777648976_51190320.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/80/1777648976_64068380.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1777648977_10472550.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/55/1777648977_31663655.jpg"
    ],
  },
  {
    name: "Sarah Bernhardt Peonies, 31 Stems",
    price: 412,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/22/1749000662_91195622.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/22/1749000662_91195622.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/90/1749000663_1391390.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/78/1749000663_80862078.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/30/1749000663_45642330.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/87/1749000663_3571187.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1749000664_64591845.jpg"
    ],
  },
  {
    name: "Snow-White Newton Grand Bouquet",
    price: 200,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1713454520_83537099.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1713454520_83537099.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/75/1713454520_8194375.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/69/1713454520_72723569.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/87/1713454520_3468287.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/39/1713454520_40921539.jpg"
    ],
  },
  {
    name: "Coral Peonies, Hydrangea & Chamomile Bouquet",
    price: 167,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/46/1715176384_31855346.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/46/1715176384_31855346.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/95/1715176385_48605395.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1715176385_12951721.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/81/1715176385_12800581.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1715176385_81724592.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/75/1715176385_87700675.jpg"
    ],
  },
  {
    name: "Peony Roses, Hydrangea & Matthiola Wow Bouquet",
    price: 679,
    image: "https://content3.flowwow-images.com/data/flowers/1000x1000/20/1738603687_4910620.jpg",
    images: [
          "https://content3.flowwow-images.com/data/flowers/1000x1000/20/1738603687_4910620.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/16/1738603687_95532016.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1738603688_81148051.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/78/1738603688_94346378.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/02/1738603688_91524602.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1738603688_41988656.jpg"
    ],
  },
  {
    name: "Roses, Dianthus & Eucalyptus Author Bouquet",
    price: 60,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1777717957_42327477.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1777717957_42327477.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1777717957_38735877.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/73/1777717957_96976773.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/71/1777717957_26007971.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/11/1777717957_44108811.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/14/1777717957_66482914.jpg"
    ],
  },
  {
    name: "Dianthus & Eucalyptus Hatbox",
    price: 50,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1777648477_73494651.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1777648477_73494651.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1777648477_16346999.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1777648477_98598557.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/82/1777648477_56778082.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/18/1777648477_78833918.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/58/1777648478_33947558.jpg"
    ],
  },
  {
    name: "Soft Dianthus & Eucalyptus Hatbox",
    price: 51,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/65/1777648670_43847965.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/65/1777648670_43847965.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/25/1777648670_78639325.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/61/1777648670_30254761.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1777648670_14141251.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/22/1777648670_35804122.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/19/1777648670_95598519.jpg"
    ],
  },
  {
    name: "Peony Roses, Chrysanthemum & Chamomile Hatbox",
    price: 67,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/91/1777724883_39174591.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/91/1777724883_39174591.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/72/1777724883_73853072.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/90/1777724883_93556990.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/14/1777724883_54802114.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/49/1777724883_90269049.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/74/1777724883_47012774.jpg"
    ],
  },
  {
    name: "Peony Roses Hatbox",
    price: 67,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1777725075_58551845.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1777725075_58551845.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1777725075_89519356.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/18/1777725075_45389118.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/78/1777725075_84821778.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1777725076_34382400.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/46/1777725076_98250346.jpg"
    ],
  },
  {
    name: "Author Flower Composition in Hatbox",
    price: 53,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1777725217_58809377.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1777725217_58809377.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/34/1777725217_83789634.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/07/1777725217_15147007.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/66/1777725217_91168066.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/24/1777725217_37885124.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/86/1777725217_35491486.jpg"
    ],
  },
  {
    name: "Cream Dianthus with Eucalyptus",
    price: 97,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/63/1777649239_26981563.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/63/1777649239_26981563.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1777649239_13001740.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1777649240_95434100.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1777649240_45563440.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1777649240_27189905.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/27/1777649240_16608727.jpg"
    ],
  },
  {
    name: "Peonies, Spray Roses & Viburnum Bouquet",
    price: 133,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/76/1777717743_78587776.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/76/1777717743_78587776.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/43/1777717743_29865343.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/71/1777717744_48525471.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/21/1777717744_78210121.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/12/1777717744_49526112.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/87/1777717744_86474687.jpg"
    ],
  },
  {
    name: "Gerbera, Peony Rose, Eustoma & Viburnum Composition",
    price: 133,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/97/1777718353_52920497.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/97/1777718353_52920497.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1777718353_55451140.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/38/1777718353_73187738.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/03/1777718353_46981203.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/74/1777718353_48164074.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/32/1777718354_95208332.jpg"
    ],
  },
  {
    name: "15 Soft Pink Carnations with Eucalyptus",
    price: 64,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/85/1731153676_69334985.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/85/1731153676_69334985.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/36/1731153676_64271236.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/07/1731153676_38264507.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/16/1731153676_15810216.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/69/1731153676_8330369.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1731153677_47945000.jpg"
    ],
  },
  {
    name: "White Hydrangea Air Bouquet",
    price: 61,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/81/1737061367_51923381.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/81/1737061367_51923381.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1737061367_92742679.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/18/1737061368_50840318.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/24/1737061368_44091724.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/64/1737061368_92263864.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/42/1737061368_62655442.jpg"
    ],
  },
  {
    name: "Pink French Roses & Eucalyptus Compliment Bouquet",
    price: 41,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1720105406_75193405.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1720105406_75193405.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/66/1720105406_13027066.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/99/1720105406_4974599.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/03/1720105406_22079603.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/21/1720105406_6386221.jpg"
    ],
  },
  {
    name: "Altai Chrysanthemums & Eucalyptus Compliment Bouquet",
    price: 35,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/82/1751321531_30741282.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/82/1751321531_30741282.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/36/1751321531_76803136.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/28/1751321532_93693828.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1751321532_20096200.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1751322531_33010857.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/12/1751322531_62067512.jpg"
    ],
  },
  {
    name: "White Lisianthus, Chamomile & Eucalyptus Bouquet",
    price: 67,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/29/1716221583_22934629.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/29/1716221583_22934629.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/01/1716221583_34265501.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1716221583_98311140.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/83/1716221584_17921183.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/18/1716221584_61862418.jpg"
    ],
  },
  {
    name: "Hydrangea Cheesecake Bouquet",
    price: 70,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/94/1715109852_12034494.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/94/1715109852_12034494.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/98/1715109852_36578398.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/27/1715109852_8377327.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/11/1715109852_41715711.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1715109852_76832145.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/68/1715109852_40962468.jpg"
    ],
  },
  {
    name: "White Dianthus & Eucalyptus Air Bouquet",
    price: 79,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/52/1724686907_99555752.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/52/1724686907_99555752.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/83/1724686907_88890083.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/55/1724686908_16253455.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/02/1724686908_15218502.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1724686908_83074350.jpg"
    ],
  },
  {
    name: "Pink Hydrangea & Eucalyptus Bouquet",
    price: 72,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/53/1740046399_70576553.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/53/1740046399_70576553.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/95/1740046400_79346095.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1740046400_52740340.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/64/1740046401_5687664.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/26/1740046401_83343826.jpg"
    ],
  },
  {
    name: "Spray Chrysanthemum & Eucalyptus Compliment Bouquet",
    price: 53,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/63/1730293158_79267963.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/63/1730293158_79267963.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1730293158_23657656.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/26/1730293159_47723726.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/13/1730293159_62597913.jpg",
          "https://content3.flowwow-images.com/data/flowers/1000x1000/61/1730293159_7805461.jpg"
    ],
  },
  {
    name: "White Chrysanthemum & Eucalyptus Air Bouquet",
    price: 63,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/10/1721058512_78297410.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/10/1721058512_78297410.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1721058512_83246340.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/37/1721058512_98177337.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/17/1721058512_91174617.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1721058512_14008456.jpg"
    ],
  },
  {
    name: "French Roses with Eucalyptus Compliment Bouquet",
    price: 41,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/42/1761050170_39186542.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/42/1761050170_39186542.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/67/1761050170_39975367.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1761050170_19152150.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/98/1761050170_50107098.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1761050171_58387045.jpg"
    ],
  },
  {
    name: "Tender Dianthus Bouquet",
    price: 59,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/54/1768926637_59010554.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/54/1768926637_59010554.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/49/1768926637_40088649.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1768926637_25648445.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/93/1768926638_17151693.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/11/1768926638_31722211.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/84/1768926638_94072984.jpg"
    ],
  },
  {
    name: "Compact White Newton Chrysanthemum & Eucalyptus Bouquet",
    price: 64,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1775307593_78258545.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1775307593_78258545.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/65/1775307595_54796165.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/02/1775307596_13284902.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1775307598_97410892.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/36/1775307599_14752536.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/96/1775307601_43856696.jpg"
    ],
  },
  {
    name: "Hanoi Dianthus Mono Bouquet, 15 Stems",
    price: 63,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/80/1776610878_27231980.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/80/1776610878_27231980.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/69/1776610879_20705869.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/37/1776610879_46216337.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/87/1776610879_12113987.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/93/1776610879_61040293.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/23/1776610879_74013723.jpg"
    ],
  },
  {
    name: "White Peonies & Eucalyptus Compliment Bouquet",
    price: 53,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1777635535_85568792.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/92/1777635535_85568792.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/71/1777635536_56309771.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/97/1777635538_42216097.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/94/1777635539_63605694.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/80/1777635540_25461380.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/96/1777635542_62131396.jpg"
    ],
  },
  {
    name: "White Dianthus Mono Bouquet",
    price: 80,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1738075346_96646505.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/05/1738075346_96646505.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/27/1738075346_72608327.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/47/1738075347_32630447.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1738075347_37158899.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/73/1738075348_77037973.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/87/1738075349_15969287.jpg"
    ],
  },
  {
    name: "Alice Pink Eustoma Mono Bouquet",
    price: 63,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1776699719_98369540.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/40/1776699719_98369540.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/61/1776699719_80580561.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/61/1776699720_25915661.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1776699720_42183679.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/13/1776699720_17470813.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/77/1776699720_23101977.jpg"
    ],
  },
  {
    name: "White Hydrangea, Chrysanthemum & Eucalyptus Bouquet",
    price: 50,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/32/1732629092_35758732.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/32/1732629092_35758732.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/99/1732629093_33198599.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/88/1732629093_65165788.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/13/1732629093_36876013.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/47/1732629094_65051347.jpg"
    ],
  },
  {
    name: "Pink French Rose & Chamomile Bouquet",
    price: 65,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1711019436_68070279.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1711019436_68070279.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/51/1711019436_91896951.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/01/1711019436_95345601.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/74/1711019436_81331874.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/18/1711019436_97074018.jpg"
    ],
  },
  {
    name: "White Matthiola, Spray Chrysanthemum & Eucalyptus Bouquet",
    price: 56,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1712342418_68782957.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/57/1712342418_68782957.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/67/1712342418_77910467.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/48/1712342418_30711348.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/00/1712342418_35173500.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/06/1712342419_11113606.jpg"
    ],
  },
  {
    name: "Hydrangea, French Rose, Chrysanthemum & Eucalyptus Bouquet",
    price: 66,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/15/1730985836_90357715.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/15/1730985836_90357715.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/88/1730985836_19832988.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/43/1730985836_22808543.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1730985837_30482256.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/33/1730985837_12599233.jpg"
    ],
  },
  {
    name: "Pink Hydrangea, Dianthus & Eucalyptus Bouquet",
    price: 66,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1731311935_31529156.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/56/1731311935_31529156.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/60/1731311936_76160260.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/45/1731311936_76122045.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/28/1731311936_29255128.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/41/1731311936_87422541.jpg"
    ],
  },
  {
    name: "Pink Hydrangea, Chrysanthemum & Eucalyptus Bouquet",
    price: 50,
    image: "https://content2.flowwow-images.com/data/flowers/1000x1000/60/1732625082_68279860.jpg",
    images: [
          "https://content2.flowwow-images.com/data/flowers/1000x1000/60/1732625082_68279860.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/50/1732625083_61978850.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/79/1732625083_88949779.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/72/1732625083_77397772.jpg",
          "https://content2.flowwow-images.com/data/flowers/1000x1000/98/1732625083_11019598.jpg"
    ],
  },
];


function flowerTier(price) {
  if (price <= 55) return 'easy yes';
  if (price <= 90) return 'make it special';
  return 'big gesture';
}

function flowerComposition(name) {
  const parts = [];
  if (/rose/i.test(name)) parts.push('Roses');
  if (/hydrangea/i.test(name)) parts.push('Hydrangea');
  if (/dianthus|carnation/i.test(name)) parts.push('Dianthus');
  if (/chrysanthemum|newton/i.test(name)) parts.push('Chrysanthemum');
  if (/eustoma/i.test(name)) parts.push('Eustoma');
  if (/matthiola/i.test(name)) parts.push('Matthiola');
  if (/tulip/i.test(name)) parts.push('Tulips');
  if (/orchid/i.test(name)) parts.push('Orchids');
  if (/ranunculus/i.test(name)) parts.push('Ranunculus');
  if (!parts.length) parts.push('Seasonal flowers');
  return [...parts, 'Fresh greenery', 'Gift wrap'];
}

const PRODUCTS = FLOWWOW_FLOWERS.map(({ name, price, image, images = [] }, idx) => {
  const tier = flowerTier(price);
  const gallery = [];
  const seen = new Set();
  for (const url of [image, ...images]) {
    const u = String(url || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    gallery.push(u);
  }
  return {
    name,
    price,
    image: gallery[0] || image,
    images: gallery,
    description: `Fresh floral arrangement with a polished look and clear price. The recipient confirms delivery after checkout.`,
    tags: `flowers,${tier}`,
    deliveryTime: '45 min',
    sort: (idx + 1) * 10,
    composition: flowerComposition(name),
  };
});

const UPSELLS = [
  {
    name: 'Gift note',
    price: 0,
    image: '/upsells/gift-note.jpg',
    description: 'A short message included with the order.',
    tags: 'note',
    deliveryTime: '',
    isUpsell: true,
    upsellSort: 10,
  },
  {
    name: 'Chocolate',
    price: 4,
    image: '/upsells/chocolate.jpg',
    description: 'A small add-on for a warmer gift.',
    tags: 'add-on',
    deliveryTime: '',
    isUpsell: true,
    upsellSort: 20,
  },
  {
    name: 'Scented candle',
    price: 9,
    image: '/upsells/scented-candle.jpg',
    description: 'A clean, giftable add-on for creator wishlists.',
    tags: 'add-on',
    deliveryTime: '',
    isUpsell: true,
    upsellSort: 30,
  },
];

const namesWhere = (predicate, limit = 50) => PRODUCTS.filter(predicate).slice(0, limit).map((p) => p.name);

const COLLECTIONS = [
  { slug: 'flowers', title: 'Flowers', type: 'thematic', sort: 10, names: PRODUCTS.map((p) => p.name) },
  { slug: 'easy-yes', title: 'Easy yes', type: 'scenario', sort: 20, names: namesWhere((p) => p.price <= 55, 18) },
  { slug: 'make-it-special', title: 'Make it special', type: 'scenario', sort: 30, names: namesWhere((p) => p.price > 55 && p.price <= 90, 18) },
  { slug: 'big-gesture', title: 'Big gesture', type: 'scenario', sort: 40, names: namesWhere((p) => p.price > 90, 12) },
  { slug: 'under-60', title: 'Under $60', type: 'scenario', sort: 50, names: namesWhere((p) => p.price < 60, 18) },
  { slug: 'premium-flowers', title: 'Premium flowers', type: 'thematic', sort: 60, names: namesWhere((p) => p.price >= 80, 14) },
  { slug: 'top-picks', title: 'Top picks', type: 'scenario', sort: 70, names: PRODUCTS.filter((_, idx) => [0, 7, 11, 14, 18, 23, 31, 39, 45, 49].includes(idx)).map((p) => p.name) },
];

async function upsertProduct(data) {
  const existing = await prisma.product.findFirst({ where: { name: data.name } });
  const payload = {
    name: data.name,
    price: data.price,
    image: data.image,
    description: data.description,
    tags: data.tags,
    deliveryTime: data.deliveryTime,
    isUpsell: Boolean(data.isUpsell),
    upsellSort: data.upsellSort || 0,
    sort: data.sort || 0,
    isActive: true,
  };

  const product = existing
    ? await prisma.product.update({ where: { id: existing.id }, data: payload })
    : await prisma.product.create({ data: payload });

  await prisma.productImage.deleteMany({ where: { productId: product.id } });
  const imageUrls = [];
  const seenImages = new Set();
  for (const url of [data.image, ...(data.images || [])]) {
    const u = String(url || '').trim();
    if (!u || seenImages.has(u)) continue;
    seenImages.add(u);
    imageUrls.push(u);
  }
  for (const [idx, url] of imageUrls.entries()) {
    await prisma.productImage.create({
      data: { productId: product.id, url, sort: idx + 1 },
    });
  }

  await prisma.productCompositionItem.deleteMany({ where: { productId: product.id } });
  for (const [idx, name] of (data.composition || []).entries()) {
    await prisma.productCompositionItem.create({
      data: { productId: product.id, name, quantity: '', sort: idx + 1 },
    });
  }

  return product;
}

async function main() {
  console.log('Start seeding Flowie private wishlist data...');

  const productsByName = new Map();
  const seedNames = [...PRODUCTS, ...UPSELLS].map((item) => item.name);
  await prisma.product.updateMany({
    where: { name: { notIn: seedNames } },
    data: { isActive: false },
  });

  for (const item of [...PRODUCTS, ...UPSELLS]) {
    const product = await upsertProduct(item);
    productsByName.set(product.name, product);
    console.log(`Upserted product: ${product.name}`);
  }

  await prisma.collectionItem.deleteMany({});
  await prisma.collection.updateMany({
    where: { slug: { notIn: COLLECTIONS.map((collection) => collection.slug) } },
    data: { isActive: false },
  });

  for (const collection of COLLECTIONS) {
    const row = await prisma.collection.upsert({
      where: { slug: collection.slug },
      update: {
        title: collection.title,
        type: collection.type,
        sort: collection.sort,
        isActive: true,
      },
      create: {
        slug: collection.slug,
        title: collection.title,
        type: collection.type,
        sort: collection.sort,
        isActive: true,
      },
    });

    const linkedProductIds = new Set();
    for (const [idx, name] of collection.names.entries()) {
      const product = productsByName.get(name);
      if (!product) continue;
      if (linkedProductIds.has(product.id)) continue;
      linkedProductIds.add(product.id);
      await prisma.collectionItem.create({
        data: { collectionId: row.id, productId: product.id, sort: idx + 1 },
      });
    }

    console.log(`Upserted collection: ${row.title}`);
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
