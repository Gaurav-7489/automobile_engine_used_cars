/**
 * Car brands, models and variants sold in India, current and discontinued (used stock is often older than the current line-up).
 * One line per model: `Model: Variant | Variant | …`. Variants are trim names; fuel and gearbox are separate fields on the car,
 * so a trim sold with several engines appears once. A model with no variants listed accepts a typed variant.
 *
 * Kept as plain text so the whole catalogue is one small lazily loaded chunk. Parsed by `catalog.ts`.
 */
export const CATALOG_TEXT: Record<string, string> = {
  "Maruti Suzuki": `
Alto: STD | LX | LXi | VXi
Alto 800: STD | LXi | VXi | CNG LXi
Alto K10: STD | LXi | VXi | VXi Plus | CNG VXi
A-Star: LXi | VXi | ZXi
Baleno: Sigma | Delta | Zeta | Alpha | CNG Delta | CNG Zeta
Brezza: LXi | VXi | ZXi | ZXi Plus | CNG LXi | CNG VXi | CNG ZXi
Celerio: LXi | VXi | ZXi | ZXi Plus | CNG VXi
Celerio X: VXi | ZXi | ZXi (O)
Ciaz: Sigma | Delta | Zeta | Alpha
Dzire: LXi | VXi | ZXi | ZXi Plus | LDi | VDi | ZDi | ZDi Plus | CNG VXi | CNG ZXi
Eeco: 5 Seater STD | 5 Seater AC | 7 Seater STD | CNG 5 Seater AC | Cargo
Ertiga: LXi | VXi | ZXi | ZXi Plus | LDi | VDi | ZDi | ZDi Plus | CNG VXi | CNG ZXi
Esteem: LX | LXi | VXi | Di
Estilo: LXi | VXi | ZXi
Fronx: Sigma | Delta | Delta Plus | Delta Plus (O) | Zeta | Alpha | CNG Sigma | CNG Delta
Grand Vitara: Sigma | Delta | Zeta | Zeta Plus | Alpha | Alpha Plus | Alpha AllGrip | CNG Delta | CNG Zeta
Gypsy: King ST | King HT
Ignis: Sigma | Delta | Zeta | Alpha
Invicto: Zeta Plus | Alpha Plus
Jimny: Zeta | Alpha
Kizashi: Std
Omni: 5 Seater | 8 Seater | Cargo
Ritz: LXi | VXi | ZXi | LDi | VDi | ZDi
S-Cross: Sigma | Delta | Zeta | Alpha
S-Presso: STD | LXi | VXi | VXi Plus | CNG LXi | CNG VXi
Swift: LXi | VXi | VXi (O) | ZXi | ZXi Plus | LDi | VDi | ZDi | ZDi Plus | CNG VXi | CNG ZXi
Swift Dzire Tour: S | S CNG
SX4: VXi | ZXi | VDi | ZDi
Wagon R: LXi | VXi | ZXi | ZXi Plus | CNG LXi | CNG VXi
XL6: Zeta | Alpha | Alpha Plus | CNG Zeta
Zen: LX | LXi | VXi
Zen Estilo: LXi | VXi
800: STD | AC
e Vitara: Delta | Zeta | Alpha`,
  Hyundai: `
Accent: GLE | GLS | Executive | CRDi
Alcazar: Executive | Prestige | Platinum | Platinum (O) | Signature | Signature (O)
Aura: E | S | SX | SX (O) | S CNG | SX CNG
Creta: E | EX | S | S (O) | SX | SX Tech | SX (O) | Knight | Adventure | N Line N8 | N Line N10
Creta Electric: Executive | Smart | Premium | Excellence
Elantra: S | SX | SX (O)
Eon: D-Lite | D-Lite Plus | Era Plus | Magna Plus | Sportz
Exter: EX | S | S Plus | SX | SX (O) | SX (O) Connect | S CNG | SX CNG
Getz: GLE | GLS | GVS | Prime
Grand i10: Era | Magna | Sportz | Asta | Sportz CNG
Grand i10 Nios: Era | Magna | Corporate | Sportz | Asta | Magna CNG | Sportz CNG
i10: D-Lite | Era | Magna | Sportz | Asta
i20: Era | Magna | Sportz | Sportz (O) | Asta | Asta (O)
i20 Active: Base | S | SX | SX (O)
i20 N Line: N6 | N8
Ioniq 5: Long Range RWD
Kona Electric: Premium | Premium Dual Tone
Santa Fe: 2WD | 4WD
Santro: D-Lite | Era | Magna | Sportz | Asta | Magna CNG | Sportz CNG
Santro Xing: GL | GLS | GLE
Sonata: Transform | Embera
Tucson: Platinum | Signature | Signature AWD
Venue: E | S | S Plus | S (O) | SX | SX (O) | Executive
Venue N Line: N6 | N8
Verna: EX | S | SX | SX (O) | SX Turbo | SX (O) Turbo
Xcent: E | S | SX | SX (O) | Prime T | Prime T Plus`,
  Tata: `
Altroz: XE | XM | XM Plus | XT | XZ | XZ Plus | XZ Plus (O) | Racer | iCNG XE | iCNG XM Plus | iCNG XZ
Aria: Pure | Pleasure | Prestige | Pride
Bolt: XE | XM | XMS | XT
Curvv: Smart | Pure Plus | Creative | Creative S | Accomplished | Accomplished Plus A
Curvv EV: Creative | Accomplished | Accomplished Plus S | Empowered Plus | Empowered Plus A
Harrier: Smart | Pure | Pure Plus | Adventure | Adventure Plus | Fearless | Fearless Plus | Dark Edition
Harrier EV: Adventure | Fearless Plus | Empowered | Empowered QWD
Hexa: XE | XM | XM Plus | XT | XT 4x4
Indica: DLS | DLE | V2 | Vista Aqua | Vista Terra | Vista Aura
Indigo: CS LS | CS LX | eCS LS | eCS VX | Marina
Manza: Aqua | Aura | Elan
Nano: Std | CX | LX | XE | XM | XT | GenX XMA
Nexon: Smart | Smart Plus | Pure | Pure Plus | Creative | Creative Plus | Fearless | Fearless Plus | Dark | iCNG Smart | iCNG Creative
Nexon EV: Creative Plus | Fearless | Fearless Plus | Empowered | Empowered Plus | Max XZ Plus | Prime XZ Plus
Punch: Pure | Adventure | Adventure Rhythm | Accomplished | Accomplished Dazzle | Creative | Camo | iCNG Pure | iCNG Adventure | iCNG Accomplished
Punch EV: Smart | Adventure | Empowered | Empowered Plus
Safari: Smart | Pure | Pure Plus | Adventure | Adventure Plus | Accomplished | Accomplished Plus | Dark Edition
Safari Storme: LX | EX | VX | VX 4x4
Sierra: Smart | Pure | Adventure | Accomplished
Sumo: CX | EX | Gold GX | Grande
Tiago: XE | XM | XT | XT (O) | XZ | XZ Plus | NRG | iCNG XE | iCNG XM | iCNG XT | iCNG XZ Plus
Tiago EV: XE | XT | XZ Plus | XZ Plus Tech Lux
Tigor: XE | XM | XZ | XZ Plus | iCNG XM | iCNG XZ | iCNG XZ Plus
Tigor EV: XE | XT | XZ Plus | XZ Plus Lux
Zest: XE | XM | XMS | XT
Xenon: XT | EX`,
  Mahindra: `
Alturas G4: 2WD | 4WD
Bolero: B4 | B6 | B6 (O) | SLE | SLX | ZLX | Power Plus
Bolero Neo: N4 | N8 | N10 | N10 (O)
BE 6: Pack One | Pack Two | Pack Three
KUV100: K2 | K4 | K6 | K8 | K8 Plus
Logan: GL | GLE | GLX
Marazzo: M2 | M4 | M6 | M8
Quanto: C2 | C4 | C6 | C8
Scorpio: S3 | S5 | S7 | S9 | S11 | Classic S | Classic S11
Scorpio N: Z2 | Z4 | Z6 | Z8 | Z8 Select | Z8 L | Z8 L 4WD
Thar: AX | AX (O) | LX | LX 4WD | Earth Edition
Thar Roxx: MX1 | MX3 | MX5 | AX3L | AX5L | AX7L | AX7L 4WD
TUV300: T4 | T6 | T8 | T10 | T10 (O)
Verito: D2 | D4 | D6
XEV 9e: Pack One | Pack Two | Pack Three
XUV 3XO: MX1 | MX2 | MX2 Pro | MX3 | MX3 Pro | AX5 | AX5 L | AX7 | AX7 L
XUV300: W4 | W6 | W8 | W8 (O)
XUV400: EC | EL | EC Pro | EL Pro
XUV500: W4 | W6 | W8 | W10 | W11 | W11 (O)
XUV700: MX | AX3 | AX5 | AX5 Select | AX7 | AX7 L | AX7 L AWD
Xylo: D2 | D4 | E4 | E8 | H8`,
  Kia: `
Carens: Premium | Prestige | Prestige Plus | Luxury | Luxury Plus | X-Line
Carens Clavis: HTE | HTK | HTK Plus | HTX | HTX Plus
Carnival: Premium | Prestige | Limousine | Limousine Plus
EV6: GT Line | GT Line AWD
EV9: GT Line AWD
Seltos: HTE | HTK | HTK Plus | HTX | HTX Plus | GTX | GTX Plus | X-Line
Sonet: HTE | HTK | HTK Plus | HTX | HTX Plus | GTX Plus | X-Line
Syros: HTK | HTK (O) | HTK Plus | HTX | HTX Plus | HTX Plus (O)`,
  Toyota: `
Camry: Hybrid | Elegance
Corolla: J | G | GL
Corolla Altis: J | G | GL | VL | Hybrid
Etios: J | G | GD | V | VX
Etios Cross: G | V | VX
Etios Liva: J | G | GD | V | VX
Fortuner: 4x2 | 4x4 | Legender | GR-S
Glanza: E | S | G | V | S CNG | G CNG
Hilux: STD | High | High AT
Hyryder: E | S | G | V | S CNG | G CNG | Hybrid S | Hybrid G | Hybrid V
Innova: G | GX | V | VX | ZX
Innova Crysta: GX | GX Plus | VX | ZX
Innova Hycross: G | GX | GX (O) | VX | VX (O) | ZX | ZX (O)
Land Cruiser: LC 200 | LC 300 ZX | LC 300 GR-S
Land Cruiser Prado: VX | VX L
Qualis: FS | GS
Rumion: S | G | V | S CNG
Taisor: E | S | S Plus | G | V | E CNG
Urban Cruiser: Mid | High | Premium
Vellfire: Hi | VIP Executive Lounge
Yaris: J | G | V | VX`,
  Honda: `
Accord: Hybrid | VL
Amaze: E | S | SX | V | VX | ZX
Brio: E | S | V | VX
BR-V: E | S | V | VX
City: E | S | SV | V | VX | ZX | e:HEV ZX
CR-V: 2WD | 4WD | AWD
Civic: V | VX | ZX
Elevate: SV | V | VX | ZX
Jazz: E | S | SV | V | VX | ZX
Mobilio: E | S | V | RS
WR-V: S | SV | VX`,
  MG: `
Astor: Sprint | Shine | Select | Sharp Pro | Savvy Pro
Comet EV: Executive | Excite | Exclusive | Blackstorm
Gloster: Super | Smart | Sharp | Savvy | Savvy 4x4 | Blackstorm
Hector: Style | Shine | Shine Pro | Select Pro | Smart Pro | Sharp Pro | Savvy Pro
Hector Plus: Style | Shine Pro | Select Pro | Smart Pro | Sharp Pro | Savvy Pro
M9: Presidential Limo
Windsor EV: Excite | Exclusive | Essence | Pro
Cyberster: Std
ZS EV: Executive | Excite | Exclusive | Exclusive Plus | Essence`,
  Renault: `
Captur: RXE | RXL | RXT | Platine
Duster: RxE | RxL | RxS | RxZ | RxZ AWD
Fluence: E2 | E4
Kiger: RXE | RXL | RXT | RXT (O) | RXZ
Kwid: RXE | RXL | RXL (O) | RXT | Climber
Lodgy: RxE | RxL | RxZ
Pulse: RxE | RxL | RxZ
Scala: RxE | RxL | RxZ
Triber: RXE | RXL | RXT | RXZ`,
  Nissan: `
Kicks: XL | XV | XV Premium | XV Premium (O)
Magnite: Visia | Visia Plus | Acenta | N-Connecta | Tekna | Tekna Plus | Kuro
Micra: XE | XL | XV | XV Premium
Micra Active: XE | XL | XV
Sunny: XE | XL | XV | XV Premium
Terrano: XE | XL | XV | XV Premium
Teana: 230jm | 250XV
X-Trail: SLX | LE | Std`,
  Datsun: `
GO: D | A | A (O) | T | T (O)
GO Plus: D | A | A (O) | T | T (O)
redi-GO: D | A | T | T (O) | S`,
  Skoda: `
Fabia: Active | Ambiente | Elegance
Karoq: Style
Kodiaq: Style | L&K | Sportline | Selection L&K
Kushaq: Active | Ambition | Style | Monte Carlo | Onyx | Prestige
Kylaq: Classic | Signature | Signature Plus | Prestige
Laura: Ambiente | Elegance | L&K
Octavia: Active | Ambition | Style | L&K | RS
Rapid: Active | Ambition | Style | Onyx | Monte Carlo | Rider
Slavia: Active | Ambition | Style | Monte Carlo | Prestige
Superb: Ambition | Style | L&K | Sportline
Yeti: Active | Ambition | Elegance`,
  Volkswagen: `
Ameo: Trendline | Comfortline | Highline | Highline Plus
Jetta: Trendline | Comfortline | Highline
Passat: Comfortline | Highline
Polo: Trendline | Comfortline | Highline | Highline Plus | GT TSI | GT TDI
Taigun: Comfortline | Highline | Highline Plus | Topline | GT | GT Plus | GT Line
T-Roc: Std
Tiguan: Comfortline | Highline | Elegance | R-Line
Tiguan Allspace: Std
Vento: Trendline | Comfortline | Highline | Highline Plus | GT
Virtus: Comfortline | Highline | Highline Plus | Topline | GT | GT Plus | GT Line`,
  Jeep: `
Compass: Sport | Longitude | Longitude (O) | Limited | Limited (O) | Model S | Model S 4x4 | Trailhawk | Night Eagle
Grand Cherokee: Limited | Limited (O) | Summit
Meridian: Longitude | Longitude Plus | Limited | Limited (O) | Overland | Overland 4x4
Wrangler: Unlimited | Rubicon`,
  "Citroen": `
Aircross: You | Plus | Max
Basalt: You | Plus | Max
C3: Live | Feel | Shine
C5 Aircross: Feel | Shine
eC3: Live | Feel | Shine`,
  BYD: `
Atto 3: Dynamic | Premium | Superior
eMAX 7: Premium | Superior
e6: GL | GLX
Seal: Dynamic | Premium | Performance
Sealion 7: Premium | Performance`,
  VinFast: `
VF6: Earth | Wind | Wind Infinity
VF7: Earth | Wind | Sky | Sky Infinity`,
  Ford: `
Aspire: Ambiente | Trend | Trend Plus | Titanium | Titanium Plus
EcoSport: Ambiente | Trend | Trend Plus | Titanium | Titanium Plus | Signature | S | Thunder
Endeavour: Trend | Titanium | Titanium Plus | Sport
Fiesta: EXi | ZXi | Ambiente | Trend | Titanium | Titanium Plus
Fiesta Classic: CLXi | SXi | Titanium
Figo: Ambiente | Trend | Trend Plus | Titanium | Titanium Plus | Titanium Blu
Freestyle: Ambiente | Trend | Trend Plus | Titanium | Titanium Plus | Flair
Ikon: CLXi | Flair | 1.3
Mustang: GT
Fusion: Std`,
  Chevrolet: `
Aveo: LS | LT
Aveo U-VA: LS | LT
Beat: PS | LS | LT | LT (O)
Captiva: LT | LTZ | LTZ AWD
Cruze: LT | LTZ
Enjoy: LS | LT | LTZ
Optra: Magnum LS | Magnum LT
Sail: Base | LS | LT
Sail U-VA: Base | LS | LT
Spark: PS | LS | LT
Tavera: B1 | B2 | Neo 3
Trailblazer: LTZ`,
  Fiat: `
Avventura: Active | Dynamic | Emotion | Urban Cross
Linea: Active | Dynamic | Emotion | T-Jet
Palio: Stile | NV | D
Petra: EL | ELX
Punto: Active | Dynamic | Emotion
Punto Evo: Active | Dynamic | Emotion
Urban Cross: Active | Dynamic`,
  Mitsubishi: `
Cedia: Elegance | Sports
Lancer: GLX | SFXi
Montero: Std
Outlander: Std
Pajero: SFX | GLS
Pajero Sport: 4x2 | 4x4 | Select Plus`,
  Isuzu: `
D-Max V-Cross: Z | Z Prestige
MU-7: Std | AT
MU-X: 4x2 | 4x4`,
  "Force Motors": `
Gurkha: 3-Door | 5-Door
Trax: Cruiser | Toofan
Trax Cruiser: Std`,
  Opel: `
Astra: GL | GLS | CD
Corsa: Joy | Sail | Swing
Vectra: Std`,
  "Hindustan Motors": `
Ambassador: Classic | Grand | Avigo`,
  Premier: `
Rio: GLX | LX | DX`,
  "SsangYong": `
Rexton: RX5 | RX6 | RX7`,
  "Mercedes-Benz": `
A-Class: A 180 | A 200 | A 200d
A-Class Limousine: A 200 | A 200d | A 35 AMG
AMG GT: 4-Door Coupe | 63 S
B-Class: B 180 | B 200
C-Class: C 200 | C 220d | C 300 | C 300d | C 43 AMG | C 63 AMG
CLA: 200 | 200 CDI | 45 AMG
CLS: 300d | 350 CDI
E-Class: E 200 | E 220d | E 250 | E 350d | E 450 | E 63 AMG
EQA: 250+
EQB: 300 4Matic | 350 4Matic
EQE SUV: 500 4Matic
EQS: 580 4Matic
G-Class: G 350d | G 400d | G 63 AMG
GLA: 200 | 200d | 220d 4Matic | 35 AMG
GLB: 200 | 220d | 220d 4Matic
GLC: 220d | 300 | 300 4Matic | 43 AMG Coupe
GLE: 300d | 400d | 450 | 53 AMG Coupe | 63 S AMG
GLS: 350d | 400d | 450 | Maybach 600
M-Class: ML 250 CDI | ML 350 CDI
Maybach S-Class: S 580 | S 680
S-Class: S 350d | S 400d | S 450 | S 500 | S 580
SLK: 350 | 55 AMG
V-Class: Expression | Exclusive | Elite`,
  BMW: `
1 Series: 116i | 118d | 120d
2 Series Gran Coupe: 218i Sport | 220d M Sport | M235i
3 Series: 320d | 320i | 330i | 330Li M Sport | M340i
3 Series GT: 320d | 330i
5 Series: 520d | 520i | 530d | 530i | 530Li
6 Series GT: 620d | 630i
7 Series: 730Ld | 740Li | 740i | 750Li | i7
i4: eDrive35 | eDrive40
iX: xDrive40 | xDrive50
iX1: eDrive20L
M2: Competition
M3: Competition
M5: Competition
X1: sDrive18i | sDrive20d | sDrive20i | xDrive20d
X3: xDrive20d | xDrive30i | M40i
X4: xDrive20d | xDrive30i | M40i
X5: xDrive30d | xDrive40i | xDrive50e | M Competition
X6: xDrive40i | M Competition
X7: xDrive40d | xDrive40i | M60i
Z4: sDrive20i | M40i`,
  Audi: `
A3: Premium | Premium Plus | Technology
A4: Premium | Premium Plus | Technology
A6: Premium | Premium Plus | Technology
A8 L: 55 TFSI | 60 TFSI
e-tron: 50 | 55 | Sportback 55
e-tron GT: Std | RS
Q2: Standard | Premium | Technology
Q3: Premium | Premium Plus | Technology | Sportback
Q5: Premium Plus | Technology
Q7: Premium Plus | Technology
Q8: Celebration | Technology | e-tron
RS5: Sportback
R8: V10 Plus | V10 Performance
S5: Sportback`,
  Jaguar: `
F-Pace: Prestige | R-Dynamic S | SVR
F-Type: R-Dynamic | R | SVR
I-Pace: SE | HSE
XE: S | SE | HSE
XF: Prestige | Portfolio | R-Sport | SE
XJ: Portfolio | Premium Luxury`,
  "Land Rover": `
Defender: 90 | 110 | 130 | V8
Discovery: S | SE | HSE | Metropolitan
Discovery Sport: S | SE | HSE | R-Dynamic SE
Freelander 2: S | SE | HSE
Range Rover: SE | HSE | Autobiography | SV
Range Rover Evoque: S | SE | HSE | R-Dynamic SE | Dynamic SE
Range Rover Sport: SE | HSE | Dynamic SE | Autobiography Dynamic | SVR
Range Rover Velar: S | SE | R-Dynamic SE | HSE`,
  Volvo: `
C40 Recharge: Ultimate
EX30: Ultra
EX40: Ultimate
S60: Inscription | B5 Ultimate
S80: D4 | D5
S90: B5 Ultimate | Inscription
V40: Kinetic | Inscription | Cross Country
XC40: B4 Ultimate | Momentum | Inscription | R-Design
XC60: B5 Ultimate | Inscription | Momentum
XC90: B5 Ultimate | Inscription | Momentum | T8 Excellence`,
  Lexus: `
ES: 300h Exquisite | 300h Luxury
LC: 500h
LM: 350h
LS: 500h
LX: 500d | 570
NX: 350h Exquisite | 350h Luxury | 350h F Sport
RX: 350h Luxury | 500h F Sport`,
  Porsche: `
911: Carrera | Carrera S | Carrera 4S | Turbo S | GT3
Cayenne: Base | E-Hybrid | S | GTS | Turbo | Coupe
Macan: Base | S | GTS | Electric | Turbo Electric
Panamera: Base | 4 | 4 E-Hybrid | GTS | Turbo S
Taycan: Base | 4S | Turbo | Turbo S | Cross Turismo
718: Boxster | Cayman | GTS`,
  Mini: `
Cooper: 3 Door | 5 Door | S | JCW
Cooper Convertible: S
Cooper Countryman: S | JCW All4 | Electric
Cooper SE: Std`,
  Maserati: `
Ghibli: Std | GranLusso | GranSport
Grecale: GT | Modena | Trofeo
Levante: Std | GranSport | Trofeo
Quattroporte: Std | GranLusso`,
  Lamborghini: `
Aventador: S | SVJ
Huracan: EVO | STO | Tecnica | Sterrato
Revuelto: Std
Urus: Std | S | Performante`,
  Ferrari: `
296 GTB: Std
488: GTB | Spider | Pista
812: Superfast | GTS
F8: Tributo | Spider
Portofino: Std | M
Purosangue: Std
Roma: Std
SF90: Stradale | Spider`,
  Bentley: `
Bentayga: V8 | Azure | Speed | EWB
Continental GT: V8 | Speed | Convertible
Flying Spur: V8 | Hybrid | Speed
Mulsanne: Std | Speed`,
  "Rolls-Royce": `
Cullinan: Std | Black Badge
Dawn: Std
Ghost: Std | Black Badge
Phantom: Std | EWB
Spectre: Std
Wraith: Std`,
  "Aston Martin": `
DB11: V8 | V12
DB12: Std
DBX: V8 | 707
Vantage: Std`,
  McLaren: `
720S: Coupe | Spider
750S: Coupe | Spider
Artura: Std
GT: Std`,
  Tesla: `
Model Y: RWD | Long Range RWD`,
};
