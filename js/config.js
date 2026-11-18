'use strict';
/* ================== Constantes bot et modes ================== */
/* Bot : moyenne visée (3 fléchettes) entre 20 et 120, ajustable au slider. */
const BOT_MIN=20,BOT_MAX=120,BOT_DEFAULT=60;
/* Modes d'entraînement — règles cf. js/game.js */
const BOBS_START=27,BOBS_ROUNDS=20;                     // Bob's 27 : 20 tours de doubles, départ 27
const HIGHSCORE_TURNS=10;                               // Highscore : 10 volées cumulées
const CATCH40_TURNS=10,CATCH40_MIN=40,CATCH40_LIVES=3;  // Catch 40 : 10 volées, 40 mini/volée, 3 vies
const PRACTICE_MODES=['bobs27','catch40','highscore'];  // solo, sans bot, hors carrière
const CHECKOUT_MAX=170;                                 // plus grand checkout possible

/* ================== État global ================== */
const STATE={
  players:[],currentPlayer:0,mode:501,finishDouble:true,doubleIn:false,
  cutThroat:false,aroundVariant:1,botAvg:BOT_DEFAULT,
  dartsThisTurn:[],currentMult:1,history:[],log:[],turnCount:0,
  gameOver:false,isBotTurn:false,visitClosing:false,
  maxTurns:0,lives:0,bobsRound:0,startTime:null,throwHistory:[],
  cricketMarks:{},aroundClock:{}
};
const STORAGE_KEY='perfectdarts_save_v1';
const CAREER_KEY='perfectdarts_career_v1';
const SETTINGS_KEY='perfectdarts_settings_v1';
const NAMES_KEY='perfectdarts_names_v1';
let PLAYER_COUNT=2;

/* Table des checkouts 2..170 (somme exacte, terminaison en double). */
const CHECKOUTS={170:"T20 T20 DBull",167:"T20 T19 DBull",164:"T20 T18 DBull",161:"T20 T17 DBull",160:"T20 T20 D20",158:"T20 T20 D19",157:"T20 T19 D20",156:"T20 T20 D18",155:"T20 T19 D19",154:"T20 T18 D20",153:"T20 T19 D18",152:"T20 T20 D16",151:"T20 T17 D20",150:"T20 T18 D18",149:"T20 T19 D16",148:"T20 T16 D20",147:"T20 T17 D18",146:"T20 T18 D16",145:"T20 T15 D20",144:"T20 T20 D12",143:"T20 T17 D16",142:"T20 T14 D20",141:"T20 T19 D12",140:"T20 T20 D10",139:"T20 T13 D20",138:"T20 T18 D12",137:"T20 T19 D10",136:"T20 T20 D8",135:"T20 T17 D12",134:"T20 T14 D16",133:"T20 T19 D8",132:"T20 T16 D12",131:"T20 T13 D16",130:"T20 T20 D5",129:"T19 T20 D6",128:"T20 T20 D4",127:"T20 T17 D8",126:"T19 T19 D6",125:"T20 T19 D4",124:"T20 T16 D8",123:"T19 T16 D9",122:"T20 T18 D4",121:"T20 T11 D14",120:"T20 20 D20",119:"T20 19 D20",118:"T20 18 D20",117:"T20 17 D20",116:"T20 16 D20",115:"T20 15 D20",114:"T20 14 D20",113:"T20 13 D20",112:"T20 12 D20",111:"T20 19 D16",110:"T20 18 D16",109:"T20 17 D16",108:"T20 16 D16",107:"T20 15 D16",106:"T20 14 D16",105:"T20 13 D16",104:"T18 18 D16",103:"T19 14 D16",102:"T20 10 D16",101:"T20 9 D16",100:"T20 D20",99:"T19 10 D16",98:"T20 D19",97:"T19 D20",96:"T20 D18",95:"T19 D19",94:"T18 D20",93:"T19 D18",92:"T20 D16",91:"T17 D20",90:"T18 D18",89:"T19 D16",88:"T16 D20",87:"T17 D18",86:"T18 D16",85:"T15 D20",84:"T20 D12",83:"T17 D16",82:"T14 D20",81:"T19 D12",80:"T20 D10",79:"T13 D20",78:"T18 D12",77:"T19 D10",76:"T20 D8",75:"T17 D12",74:"T14 D16",73:"T19 D8",72:"T16 D12",71:"T13 D16",70:"T18 D8",69:"T19 D6",68:"T20 D4",67:"T17 D8",66:"T10 D18",65:"T19 D4",64:"T16 D8",63:"T13 D12",62:"T10 D16",61:"T15 D8",60:"20 D20",59:"19 D20",58:"18 D20",57:"17 D20",56:"16 D20",55:"15 D20",54:"14 D20",53:"13 D20",52:"12 D20",51:"11 D20",50:"10 D20",49:"9 D20",48:"8 D20",47:"15 D16",46:"14 D16",45:"13 D16",44:"12 D16",43:"11 D16",42:"10 D16",41:"9 D16",40:"D20",39:"7 D16",38:"D19",37:"5 D16",36:"D18",35:"3 D16",34:"D17",33:"1 D16",32:"D16",31:"15 D8",30:"D15",29:"13 D8",28:"D14",27:"11 D8",26:"D13",25:"9 D8",24:"D12",23:"7 D8",22:"D11",21:"5 D8",20:"D10",19:"3 D8",18:"D9",17:"1 D8",16:"D8",15:"7 D4",14:"D7",13:"5 D4",12:"D6",11:"3 D4",10:"D5",9:"1 D4",8:"D4",7:"3 D2",6:"D3",5:"1 D2",4:"D2",3:"1 D1",2:"D1"};

/* ================== Réglages ================== */
let SETTINGS={theme:'dark',accent:'orange',voiceLang:'fr',voiceGender:'female',sounds:true,volume:0.5,inputMethod:'pad',vibration:true,playerCount:2,oled:true,botAvg:BOT_DEFAULT};
function loadSettings(){try{const raw=localStorage.getItem(SETTINGS_KEY);if(raw)Object.assign(SETTINGS,JSON.parse(raw))}catch(e){}}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(SETTINGS))}catch(e){}}
function applyTheme(){document.body.dataset.theme=SETTINGS.theme==='light'?'light':'dark';document.body.dataset.accent=SETTINGS.accent;document.body.dataset.oled=SETTINGS.oled?'1':'';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',SETTINGS.theme==='light'?'#eef1f8':'#07091a')}
function buzz(ms){if(SETTINGS.vibration&&navigator.vibrate){try{navigator.vibrate(ms)}catch(e){}}}
function fmtMode(m){return typeof m==='number'?String(m):({cricket:'Cricket',around:'Around the Clock',bobs27:"Bob's 27",catch40:'Catch 40',highscore:'Highscore'}[m]||String(m))}
