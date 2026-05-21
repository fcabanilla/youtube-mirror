/**
 * Rule-based channel classifier.
 * Reads channels.json, applies keyword rules + explicit overrides, writes classifications.json.
 *
 * Run: npm run classify:auto
 * Then:  npm run classify:apply && npm run report
 *
 * This replaces the manual agent-classification workflow when context window runs out.
 * Explicit overrides (verified by reading to_classify.md across 3 sessions) cover the
 * top ~90 channels by watchCount. Keyword rules handle the long tail.
 */

import fs from 'fs';
import type { Channel } from '../types.js';

const CHANNELS_FILE = 'output/channels.json';
const CLASSIFICATIONS_FILE = 'output/classifications.json';

const VALID_CATEGORIES = [
  'tech/hardware', 'tech/software', 'tech/gaming',
  'news/argentina', 'news/international',
  'opinion/economics', 'opinion/general',
  'entertainment/humor', 'entertainment/sports', 'entertainment/lifestyle',
  'education/science', 'education/history', 'education/skills',
  'uncategorized',
] as const;

type Category = typeof VALID_CATEGORIES[number];

interface ClassifyResult {
  channelId: string;
  categoryPrimary: Category;
  categorySecondary?: Category;
}

// ─── Explicit overrides (channelId verified from reading channels.json / to_classify.md) ───
const OVERRIDES: Record<string, { primary: Category; secondary?: Category }> = {
  // === Top channels by watchCount ===
  'UC4mdhKZXjrKoq5aVG6juHEg': { primary: 'news/argentina' },                          // Carajo (715)
  'UC15QE9U_c5QZd1qKP57_hMA': { primary: 'tech/gaming' },                             // El Escoces gamer (585)
  'UCE57VNLm30EdtL5xqrzb04g': { primary: 'entertainment/humor' },                     // Sr Galileo Clips (369)
  'UCUWDBUEo1YFTzZnBV1aFDBw': { primary: 'entertainment/humor' },                     // spicy4tuna (257)
  'UCV1WCVexFXNTq_t5Z4xgGNw': { primary: 'news/argentina' },                          // LHDA PODCAST (243)
  'UCghIPqIy3syDuqtXh69Ufbg': { primary: 'entertainment/sports' },                    // Borja Zazo Simracing (235)
  'UCvz84_Q0BbvZThy75mbd-Dg': { primary: 'entertainment/humor' },                     // Zack D. Films (173)
  'UCHIwQiZhIn6fm5b_IilqBbQ': { primary: 'tech/gaming' },                             // DaniRep - GTA 5 (159)
  'UCTeFgT77A2LNTb05VcCW71Q': { primary: 'education/science' },                       // Breaking Vlad - química (155)
  'UCPKZ8NsUm96HK-5bpCgVl6w': { primary: 'education/science' },                       // MedHouse (152)
  'UC3gdaplfyzSr2YjHHwxRhPQ': { primary: 'entertainment/sports' },                    // Heikki360ES - simracing (148)
  'UCYWh9eJKxYTt9wTRZj5hVDA': { primary: 'education/skills' },                        // The Lawn Tools (140)
  'UCXcRErqJBmvlQGeqgIemuiA': { primary: 'education/skills' },                        // Miguel ASSAL - primeros auxilios (140)
  'UCgrWL3ZYxUjNEQ0gZTtp2Iw': { primary: 'entertainment/sports' },                    // Sportmaniaticos.com - F1 (136)
  'UCgFTsRj4KniAWimZFtaxJSA': { primary: 'entertainment/humor' },                     // Lupago (130)
  'UCbsCmBNSW6mf9DGW3g5VlNA': { primary: 'entertainment/sports' },                    // La Formula de DAVID PEROGIL - F1 (130)
  'UC-40U87JsevMIMn7PMw4jPw': { primary: 'opinion/general' },                         // Neura Media (129)
  'UCiZKQvmrtQzecByWmMg7fnw': { primary: 'education/skills' },                        // Master Builder Alec - LEGO (127)
  'UCBLCvUUCiSqBCEc-TqZ9rGw': { primary: 'opinion/economics' },                       // Juan Ramón Rallo (112)
  'UCTqb7oZzCYpzOhPenq6AOyQ': { primary: 'news/international' },                      // Solo Fonseca - pol. internacional (109)
  'UCzmvTwRkUUsd-RguaMl2V1g': { primary: 'news/argentina' },                          // Tipito LIVE (104)
  'UC274PEnFIQktbCbxDzzS-7Q': { primary: 'entertainment/lifestyle' },                 // ShortPocketMonster - TCG (102)
  'UC_Hn4bGSAjGIQr1gLMeX03w': { primary: 'entertainment/humor' },                     // ESP.Shorox (101)
  'UCNYW2vfGrUE6R5mIJYzkRyQ': { primary: 'entertainment/humor' },                     // DrossRotzank - horror/misterios (99)
  'UC0LmBoDfOz7WU-MPTto0Mmw': { primary: 'opinion/general' },                         // Podcastopedia (98)
  'UCFqLPdQm-k5uCI9gFaxraeA': { primary: 'education/history' },                       // Eugenio Monesma - etnografía (92)
  'UC04Yi550wbwSWJIRjZm_dvg': { primary: 'entertainment/sports' },                    // GITGUD Racing - simracing (90)
  'UC0z91or00IFw5xK5PXTQzqw': { primary: 'education/science' },                       // Sergio Hidalgo - aeroespacial (88)
  'UCrqDcwLssaU6YyzzQioxxdQ': { primary: 'education/skills' },                        // Sam Builds - DIY (87)
  'UCxgVhB-sNnZ-O27LZAkck9A': { primary: 'tech/gaming' },                             // TiToPinha - videojuegos (86)
  'UCUMGHyVR683x8dePcMKrPqg': { primary: 'entertainment/humor' },                     // Comicfy Esp (84)
  'UCBYyJBCtCvgqA4NwtoPMwpQ': { primary: 'opinion/general' },                         // The Wild Project - Jordi Wild podcast (81)
  'UC1QVogzkzXnNguybvD8yItg': { primary: 'entertainment/humor' },                     // En Español Por Favor (78)
  'UC_49ElhhVd1BO7MsdBPm77Q': { primary: 'news/argentina' },                          // BREAK POINT - liberalismo (78)
  'UCYrW48DY2j42PelfX_NIKCA': { primary: 'entertainment/humor' },                     // Chacal Boggian - shitposting (75)
  'UC8bCGC81i_jYlL041-iAFSA': { primary: 'entertainment/humor' },                     // JWulen (74)
  'UCmb0LnmFYceH7toqgmUTJDA': { primary: 'tech/gaming' },                             // Vandal - videojuegos (74)
  'UCHzmAVaBC9ORwY7i91k5l1Q': { primary: 'education/skills' },                        // Juanjo Bricks - LEGO DIY (72)
  'UC_lBPIZQ_mX5ERtvSlpBPEQ': { primary: 'entertainment/humor' },                     // JWulen 2 (72)
  'UCE3_GJkiSkRF1zBcj3cV5Lg': { primary: 'entertainment/lifestyle' },                 // Cuentos con Alma - cine (72)
  'UCQWPc-n_8Ld3v94MeQHPxrA': { primary: 'entertainment/humor' },                     // El canal de Korah (71)
  'UCFOSg71CRAJ58IPuV_-jMbw': { primary: 'tech/hardware' },                           // Tecnonauta (71)
  'UCYCcMzsmrwfsktcD7TP9bww': { primary: 'education/skills' },                        // Brick Master Harri - LEGO (71)
  'UCsGYMvcMeUCxXIx--A7SU6w': { primary: 'education/skills' },                        // Javier Romero - joyería artesanal (69)
  'UCOWFKaCN-rzmYk502JFWnqg': { primary: 'education/science' },                       // Eze Martínez - divulgación (67)
  'UCFoogZCIY7wWlYpnP80GwHQ': { primary: 'entertainment/humor' },                     // Klanir - historias cortas (66)
  'UCiZxvHrnm8mxrxmZOJ8rD3Q': { primary: 'entertainment/humor' },                     // Zesaru (65)
  'UCCOrp7GPgZA8EGrbOcIAsyQ': { primary: 'education/skills' },                        // Phone Repair Guru (63)
  'UCPIgqTAeWOgNvrjsGY68JSw': { primary: 'entertainment/sports', secondary: 'news/argentina' }, // Laca Stream - F1+política (63)
  'UCqex_bdMOJq0M-rJg-4ghFA': { primary: 'uncategorized' },                           // Biblical Of Jesus - religioso (63)
  'UCbhgykBEnlKpEWCmVpmnXSg': { primary: 'education/science' },                       // Ingeniero Espacial (62)
  'UCCg7-voweLs3ZZchb_RPpyA': { primary: 'tech/gaming' },                             // The Shooterman - FPS (62)
  'UCrQFAB5KEroViBiyg7WDcqQ': { primary: 'education/skills' },                        // LOS CAZA JUGUETES - restauración (62)
  'UChWSSxhYqMdiZET90kfKSlw': { primary: 'entertainment/humor' },                     // Chicago police - clips (61)
  'UC70cFXqSdlnyA6CrbzS5wvQ': { primary: 'news/argentina' },                          // El Peluca Milei Cortos (61)
  'UCCc5EqGKYAJWgwOUnRYmURQ': { primary: 'entertainment/lifestyle' },                 // CHEFSCHWARZ (60)
  'UC182_l05xymX0Nfeh9sFOiA': { primary: 'entertainment/lifestyle' },                 // Bouncer Power (60)
  'UC3_bnv8OG56w98AeVRH0_VQ': { primary: 'entertainment/humor' },                     // Kuvs (59)
  'UCM2MONuYe8IH8W-gYZgYxNg': { primary: 'entertainment/lifestyle' },                 // Vetventures Spanish - veterinaria (59)
  'UCJm3VkUZBatO7ZhcYJQN8wg': { primary: 'entertainment/humor' },                     // Mi Alter Edu (57)
  'UCOhsgjMEyldgS04MiP2x-zA': { primary: 'tech/gaming' },                             // LVNDMARK - Tarkov (56)
  'UC5osBIeSvmK7GHplq8O-qdg': { primary: 'entertainment/humor' },                     // COLIMBA (53)
  'UC4Qxg_loA98TioGN6RslUcA': { primary: 'entertainment/sports' },                    // TDG Racing Team (54)
  'UCxaObEYJavkQJDQsoRBIXPA': { primary: 'entertainment/sports' },                    // Abel Caro - F1 (50)
  'UCM4gGe6lvoEx03r2rx9Ebgw': { primary: 'entertainment/humor' },                     // Chares con Teresa (49)
  'UCwGX2cE21VPBEJ49hcprP9w': { primary: 'tech/hardware' },                           // SupraPixel (48)
  'UC_qspxIbv_iMtfg7rJfbyOg': { primary: 'entertainment/lifestyle' },                 // Japatonic - Japan lifestyle (48)
  'UCG0PQ7FQ0UJuo49JJdTdUsA': { primary: 'entertainment/sports' },                    // Danisable Racing (48)
  'UC8LeXCWOalN8SxlrPcG-PaQ': { primary: 'tech/software' },                           // midudev - web dev (46)
  'UCB_qr75-ydFVKSF9Dmo6izg': { primary: 'entertainment/sports' },                    // FORMULA 1 oficial (45)
  'UC83J3suUsNnOacIkqOyKvhw': { primary: 'opinion/general' },                         // Farid Dieck (44)
  'UCblfuW_4rakIf2h6aqANefA': { primary: 'entertainment/sports' },                    // Red Bull (42) - Red Bull Racing
  'UCXvCI4YnkGhGV8ei4vE9h4A': { primary: 'entertainment/lifestyle' },                 // Jose.elcook (39)
  'UCJKjzEoy91UYS-bZLc4CLCQ': { primary: 'opinion/general' },                         // Agustín Laje Arrigoni (39)
  'UCGQctkMVuEirLOcQ5Ahxx9A': { primary: 'opinion/general' },                         // Black Mango Shorts (38)
  'UCJQQVLyM6wtPleV4wFBK06g': { primary: 'news/international' },                      // VisualPolitik (34)
  'UCQWi9o-W33aTTtFXm_tnZrg': { primary: 'opinion/economics' },                       // InvierteConPepe (36)
  'UCoClEFEgw86AVHbTborepuA': { primary: 'education/history' },                       // Der Ausländer (30)
  'UC3ihbdt1ts99ErYRxbWUB7A': { primary: 'entertainment/sports' },                    // UKOG - simracing (29)
  'UCEI1axjcS88ltgWRTmbeVLQ': { primary: 'entertainment/lifestyle' },                 // elCampodeIvan - campo/vida rural (28)
  'UCs5Y5_7XK8HLDX0SLNwkd3w': { primary: 'tech/software' },                           // Visual Studio Code (25)
  'UCemCEiggsSboHnUCCiS6RXQ': { primary: 'entertainment/sports' },                    // NicheLow - simracing (26)
  'UCXvbilRzK1DrcrYM_0-BxfQ': { primary: 'entertainment/lifestyle' },                 // Megan and Ben (26)
  'UC36xmz34q02JYaZYKrMwXng': { primary: 'tech/hardware' },                           // Nate Gentile (23)
  'UCMiJRAwDNSNzuYeN2uWa0pA': { primary: 'tech/hardware' },                           // Mrwhosetheboss (23)
  'UCEQXxiYxNZbym9Fad7-n2Lg': { primary: 'education/science' },                       // Doctor Fisión (23)
  'UC7c3Kb6jYCRj4JOHHZTxKsQ': { primary: 'tech/software' },                           // GitHub (19)
  'UCL1ITQtr7ogwPN-5w96kG7Q': { primary: 'opinion/general' },                         // Black Mango (18)
  'UC0mJA1lqKjB4Qaaa2PNf0zg': { primary: 'entertainment/sports' },                    // Red Bull Motorsports (17)
  'UCIDwrvzFmnpKMLp2H1WUtyQ': { primary: 'entertainment/humor' },                     // CHEBOLUDO (10)
  'UCPH3Oz99Y_jrVBCQMjQZNSg': { primary: 'education/history' },                       // Memorias de Pez (9)
  'UCrYx1j4RUuSDRGLZK5ssYSQ': { primary: 'entertainment/sports' },                    // Red Bull USA (6)

  // === Additional high-watchCount channels found after first run ===
  'UCgTQvewmXS-DmfNQPtyACXw': { primary: 'tech/gaming' },                             // Walkemdownoah (53) - gaming
  'UCC8BQ014k4MbRNQFFVYgvUg': { primary: 'tech/gaming' },                             // BAXBESTIA/BAXBEASTIA (43) - Tarkov
  'UCNS2RmWszAW2fM9BiEwe4mw': { primary: 'tech/gaming' },                             // VeryBadSCAV (43) - EFT/Tarkov
  'UCexAG1GrsBeYFaPxu8-gOAQ': { primary: 'entertainment/humor' },                     // Iron Huevo (41)
  'UCNZ8G0MNADk7c8yiio4eBOQ': { primary: 'tech/gaming' },                             // SheefGG (57) - gaming
  'UCk-2CI-wVoDbojJ4fVK2yKQ': { primary: 'tech/gaming' },                             // The Grox DayZ (54) - DayZ game
  'UCeJJFrtN2NvDdgMgddxaw7g': { primary: 'education/science' },                       // Ingeniería para ti (50)
  'UChO1Y5H2XtXF7QAxHlremVQ': { primary: 'tech/hardware' },                           // Tecnitips (50)
  'UCL6etcY_OIy_9sYOS26B36A': { primary: 'education/science' },                       // DanElCurioso (45)
  'UC4kzD9kW5l790Cd-vtLtjWg': { primary: 'education/history' },                       // Civilian Tactical (48) - military
  'UCQ07Yja_DRbv6tV_c7HTMBw': { primary: 'entertainment/sports' },                    // Futbol Activo (52)
  'UC-youUqI8_S1GEAr3zRiysg': { primary: 'education/skills' },                        // DIEGO RECICLA (40)
  'UCe466wDIkhN6bDCRe5Te6uA': { primary: 'education/history' },                       // Airwingmarine (39) - aviation/military
  'UC-DB9l_ldkj4pkzMSoGJlCg': { primary: 'education/skills' },                        // FinCantBuild (39) - building
  'UCGt1FYidrwoRdT6VbNuNXsw': { primary: 'tech/gaming' },                             // ElysianWares (56) - gaming
  'UCO8bjw-KdUwjpD9FAchaE0w': { primary: 'entertainment/humor' },                     // Kralos (49)
  'UCiua0BtuWrPCiK_cAiL63uw': { primary: 'entertainment/lifestyle' },                 // Team Eevee (42) - Pokemon/hobby
  'UCmJdJHHe_msjZnZa7q6IVdg': { primary: 'entertainment/humor' },                     // 9-1-1 house (42)
};

// ─── Music/topic channel detection ─────────────────────────────────────────────────────────
function isMusicChannel(name: string, desc: string): boolean {
  if (name.endsWith(' - Topic')) return true;
  if (/vevo/i.test(name)) return true;
  if (/official (music|artist) channel/i.test(desc)) return true;
  if (/artista oficial|artist youtube channel/i.test(desc)) return true;
  return false;
}

// ─── Keyword scoring ────────────────────────────────────────────────────────────────────────
function scoreChannel(name: string, desc: string): Partial<Record<Category, number>> {
  const scores: Partial<Record<Category, number>> = {};
  const n = name.toLowerCase();
  const d = desc.toLowerCase();

  const add = (cat: Category, score: number) => {
    scores[cat] = (scores[cat] ?? 0) + score;
  };

  // ── tech/gaming ──
  if (/\bgam(er|ing|eplay)\b/.test(n) || /videojueg/.test(n)) add('tech/gaming', 10);
  if (/\bfps\b|\bgta\b|\bapex\b|\btarkov\b|\bwarzone\b|\bcsgo\b|\bvalorant\b|\bfortnite\b|\bminecraft\b|\boverwatch\b/.test(n)) add('tech/gaming', 10);
  if (/\bdayz\b|\braid\b|\beft\b|\bscav\b|\broblox\b|\bpokemon\b/.test(n)) add('tech/gaming', 7);
  if (/\bgam(er|ing|eplay)\b/.test(d) || /\bvideojueg/.test(d)) add('tech/gaming', 5);
  if (/\bapex legends\b|\bescape from tarkov\b|\bgta 5\b|\bdayz\b/.test(d)) add('tech/gaming', 6);
  if (/\bstreamer\b|\btwitch\b/.test(n) && !/racing|f1\b|simrac/.test(n)) add('tech/gaming', 3);
  if (/\bgamer\b|\bgaming\b|\bgameplay\b|\bvideojueg/.test(d) && !/simracing|automovilismo/.test(d)) add('tech/gaming', 4);

  // ── entertainment/sports ──
  if (/\bsimracing\b|\bsim racing\b/.test(n)) add('entertainment/sports', 12);
  if (/\bf1\b|\bformula[\s_]?1\b|\bfórmula[\s_]?1\b/.test(n)) add('entertainment/sports', 10);
  if (/\bracing\b/.test(n) && !/arms? race/.test(n)) add('entertainment/sports', 8);
  if (/\bnascar\b|\bimsa\b|\bindycar\b|\bmotogp\b|\bwec\b/.test(n)) add('entertainment/sports', 10);
  if (/\bpaddock\b|\bpitlane\b|\bcircuito\b/.test(n)) add('entertainment/sports', 8);
  if (/\bfútbol\b|\bfutbol\b|\bsoccer\b/.test(n) && !/videojueg/.test(d)) add('entertainment/sports', 9);
  if (/\bbasket\b|\btenis\b|\bdeporte\b/.test(n) && !/videojueg/.test(d)) add('entertainment/sports', 7);
  if (/\bsimracing\b|\bautomovilismo\b|\bfórmula\b|\bformel\b/.test(d)) add('entertainment/sports', 6);
  if (/\bmotorsport\b|\brace track\b|\blap time\b/.test(d)) add('entertainment/sports', 5);

  // ── news/argentina ──
  if (/\bmilei\b|\blibertad avanza\b/.test(n)) add('news/argentina', 12);
  if (/\blibertario\b/.test(n) && !/libertario.*libros|libertario.*historia/.test(n)) add('news/argentina', 10);
  if (/\btipito\b|\bpeluca milei\b/.test(n)) add('news/argentina', 10);
  if (/\btodo noticias\b|\bcanal 26\b|\ba24\b/.test(n)) add('news/argentina', 10);
  if (/\bkirchner\b|\bperonismo\b|\bcasta\b.*\bpolít/.test(n)) add('news/argentina', 10);
  if (/política argentina|economía argentina|milei|libertad avanza/.test(d)) add('news/argentina', 5);
  if (/\bargentina\b/.test(n) && /notic|polít|econ/.test(n)) add('news/argentina', 8);

  // ── news/international ──
  if (/visual.?politik/i.test(n)) add('news/international', 12);
  if (/\bgeopolít|\bgeopolitics\b/.test(n)) add('news/international', 10);
  if (/\bpulso de la república\b|\bac2ality\b/.test(n)) add('news/international', 10);
  if (/política internacional|geopolit/.test(d) && !/argentina/.test(d)) add('news/international', 5);

  // ── education/science ──
  if (/\bciencia\b|\bscience\b|\bfísica\b|\bquímica\b|\bbiología\b/.test(n)) add('education/science', 10);
  if (/\bquantum\b|\bnuclear\b|\bastronomí\b|\bneuro\b/.test(n) && !/gaming|sport/.test(n)) add('education/science', 9);
  if (/\bveritasium\b|\bnilered\b|\b3blue1brown\b/.test(n)) add('education/science', 10);
  if (/\bingeniería\b|\bengineering\b/.test(n) && !/software|web|gaming/.test(n)) add('education/science', 8);
  if (/\bcurioso\b|\bcuriosidad\b|\bcurious\b/.test(n)) add('education/science', 6);
  if (/\baeroespacial\b|\baerospace\b|\baeronautic/.test(d)) add('education/science', 7);
  if (/\bquímic\b|\bbiology\b|\bphysics\b|\bchemistry\b/.test(d)) add('education/science', 5);
  if (/\bdivulg.*científ\b|\bingeniería\b.*\bciencia\b/.test(d)) add('education/science', 5);
  if (/\bexperimento\b|\bexperiment\b/.test(n)) add('education/science', 5);

  // ── education/history ──
  if (/\bhistoria\b|\bhistory\b/.test(n) && !/natural history/.test(n)) add('education/history', 10);
  if (/\bmilitar\b|\bww2\b|\bwwii\b|\bsoviet\b|\bguerra\b/.test(n)) add('education/history', 8);
  if (/\barqueolog\b|\bmedieval\b|\bmalvinas\b/.test(n)) add('education/history', 8);
  if (/\bhistory\b|\bhistoria\b/.test(d) && !/gaming|sport|recipe/.test(d)) add('education/history', 4);
  if (/\barmada\b|\bbélico\b|\bcombate\b/.test(n)) add('education/history', 7);

  // ── entertainment/humor ──
  if (/\bhumor\b|\bcomedi\b|\bcomedy\b|\bsketch\b|\bmeme\b/.test(n)) add('entertainment/humor', 10);
  if (/\bshitpost\b|\bparodia\b|\bgracioso\b|\bfunny\b/.test(n)) add('entertainment/humor', 8);
  if (/\bclips?\b/.test(n) && !/racing|simracing|f1\b|tutorial/.test(n)) add('entertainment/humor', 4);
  if (/\bhumor|comedia|comedy|funny\b/.test(d)) add('entertainment/humor', 4);
  if (/\bstandup\b|\bstand.up\b/.test(n)) add('entertainment/humor', 9);

  // ── entertainment/lifestyle ──
  if (/\bcocina\b|\bchef\b|\breceta\b|\brecipe\b|\bpizza\b|\basado\b|\bbbq\b/.test(n)) add('entertainment/lifestyle', 10);
  if (/\bsushi\b|\bgastronomí\b|\bfood\b|\bcook/.test(n) && !/cooking tutorial|learn to cook/.test(n)) add('entertainment/lifestyle', 8);
  if (/\bjapan\b|\bjapon\b|\btokyo\b|\bjapanese\b/.test(n)) add('entertainment/lifestyle', 7);
  if (/\bvlog\b|\btravel\b|\bviaje\b|\blifestyle\b/.test(n)) add('entertainment/lifestyle', 7);
  if (/\bcafé\b|\bcoffee\b|\bbeer\b|\bcerveza\b/.test(n)) add('entertainment/lifestyle', 6);
  if (/cooking|recipe|gastronomí|lifestyle|travel|vlog/.test(d) && !/tutorial step/.test(d)) add('entertainment/lifestyle', 4);
  if (/\brestaurante\b|\bbistro\b|\bcuisine\b/.test(d)) add('entertainment/lifestyle', 4);

  // ── tech/hardware ──
  if (/\bhardware\b|\bsmartphone\b|\biphone\b|\bandroid\b/.test(n)) add('tech/hardware', 10);
  if (/\blaptop\b|\bgpu\b|\bcpu\b|\bpc build\b/.test(n)) add('tech/hardware', 10);
  if (/\bgadget\b|\belectronica\b|\belectronics\b/.test(n)) add('tech/hardware', 8);
  if (/\blinus tech\b|\bmrwhosetheboss\b|\bjerry.?rig\b/.test(n)) add('tech/hardware', 10);
  if (/\btech\b/.test(n) && !/teaching|biotech|biotechnology/.test(n)) add('tech/hardware', 5);
  if (/hardware|gadget|smartphone|electronics|review.*tech/.test(d) && !/gaming|sport|programming/.test(d)) add('tech/hardware', 4);

  // ── tech/software ──
  if (/\bcoding\b|\bprogramm/.test(n)) add('tech/software', 10);
  if (/\bdeveloper\b|\bsoftware\b/.test(n) && !/device|software house/.test(n)) add('tech/software', 8);
  if (/\bpython\b|\bjavascript\b|\btypescript\b|\breact\b|\bvue\b|\bangular\b/.test(n)) add('tech/software', 10);
  if (/\bdevops\b|\blinux\b|\bdocker\b|\bkubernetes\b/.test(n)) add('tech/software', 10);
  if (/\bqa\b.*\btest|\bautomation test|\bselenium\b|\bplaywright\b/.test(n)) add('tech/software', 8);
  if (/\bllm\b|\bgpt\b|\bopenai\b/.test(n)) add('tech/software', 6);
  if (/programming|software development|coding|developer|devtools/.test(d)) add('tech/software', 4);
  if (/\bfireship\b|\bweb dev simplified\b|\bprimeagen\b/.test(n)) add('tech/software', 10);

  // ── opinion/economics ──
  if (/\binvers[oió]\b|\bfinanza\b|\btrading\b|\bbolsa\b/.test(n)) add('opinion/economics', 10);
  if (/\becono(mía|mics|mik)\b/.test(n) && !/argentina|noticia|ciencia/.test(n)) add('opinion/economics', 8);
  if (/\bbitcoin\b|\bcrypto\b|\bstocks?\b/.test(n)) add('opinion/economics', 7);
  if (/\bwall.?street\b|\bhedge fund\b/.test(n)) add('opinion/economics', 8);
  if (/inversión|finanzas|trading|economía personal|portfolio/.test(d) && !/argentina polít/.test(d)) add('opinion/economics', 4);

  // ── opinion/general ──
  if (/\bdebate\b|\bensayo\b/.test(n)) add('opinion/general', 8);
  if (/\bfiloso(fía|phy)\b/.test(n) && !/science|gaming/.test(n)) add('opinion/general', 7);
  if (/\blaje\b|\bdieck\b|\bbonato\b/.test(n)) add('opinion/general', 8);
  if (/\bpodcast\b/.test(n) && !/science|gaming|tech|recipe/.test(n)) add('opinion/general', 4);
  if (/\bbatalla cultural\b|\bconservador\b|\bprogresismo\b/.test(n)) add('opinion/general', 7);

  // ── education/skills ──
  if (/\btutorial\b|\bhow.to\b|\bcomo hacer\b/.test(n)) add('education/skills', 10);
  if (/\bdiy\b|\bwoodwork\b|\bcarpinter\b/.test(n)) add('education/skills', 10);
  if (/\brestoration\b|\brestaura(ción|r)\b|\brepair\b/.test(n)) add('education/skills', 9);
  if (/\bgym\b|\bworkout\b|\bfitness\b|\bejercicio\b/.test(n) && !/sport news/.test(n)) add('education/skills', 8);
  if (/\bguitar\b|\bpiano\b|\bviolin\b|\bmusic lesson\b/.test(n)) add('education/skills', 8);
  if (/\bsewing\b|\bcostura\b|\bcrochet\b|\bknitting\b/.test(n)) add('education/skills', 8);
  if (/tutorial|how to|diy|woodworking|restoration|fitness/.test(d) && !/gaming|sport race/.test(d)) add('education/skills', 4);

  return scores;
}

// ─── Main classifier ────────────────────────────────────────────────────────────────────────
function classifyChannel(channel: Channel): ClassifyResult {
  const name = channel.channelName ?? '';
  const desc = channel.description ?? '';

  // 1. Explicit override (verified by human reading)
  if (OVERRIDES[channel.channelId]) {
    const o = OVERRIDES[channel.channelId];
    return { channelId: channel.channelId, categoryPrimary: o.primary, categorySecondary: o.secondary };
  }

  // 2. Music / auto-generated topic channel
  if (isMusicChannel(name, desc)) {
    return { channelId: channel.channelId, categoryPrimary: 'uncategorized' };
  }

  // 3. Keyword scoring
  const scores = scoreChannel(name, desc);
  const sorted = (Object.entries(scores) as [Category, number][]).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0 || sorted[0][1] === 0) {
    return { channelId: channel.channelId, categoryPrimary: 'uncategorized' };
  }

  const primary = sorted[0][0];
  const secondaryEntry = sorted[1];
  const secondary =
    secondaryEntry && secondaryEntry[1] >= sorted[0][1] * 0.6 && secondaryEntry[0] !== primary
      ? secondaryEntry[0]
      : undefined;

  return { channelId: channel.channelId, categoryPrimary: primary, categorySecondary: secondary };
}

// ─── Entry point ────────────────────────────────────────────────────────────────────────────
function main() {
  const channels: Channel[] = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf-8'));
  console.log(`Classifying ${channels.length} channels...`);

  const results: ClassifyResult[] = channels.map(classifyChannel);

  // Print distribution
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.categoryPrimary] = (counts[r.categoryPrimary] ?? 0) + 1;
  console.log('\nCategory distribution:');
  for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(28)} ${count}`);
  }

  fs.writeFileSync(CLASSIFICATIONS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nDone. ${results.length} classifications → ${CLASSIFICATIONS_FILE}`);
  console.log('Next: npm run classify:apply && npm run report');
}

main();
