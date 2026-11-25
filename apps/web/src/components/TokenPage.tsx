'use client';

import { ACHIEVEMENTS, ACH_CATEGORIES, ACH_TIERS, ACH_TIER_ORDER, B, GAME_VERSION, type AchCategory } from '@solrift/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AccountPanel } from './AccountPanel';
import { Blocks } from './BlockCube';
import { TokenWallet, useTokenBalance } from './TokenWallet';
import { TokenEconomy } from './TokenEconomy';
import { useToken, type TokenLiveInfo } from '../token/store';
import { ClickSparks, Embers, Reveal, useFrontMotion } from './fx';
import { lobbyUrl } from '../game/route';
import { SCROLL_KEY, goBeyond, goMarket, goFarm, goShop, goRanks } from './frontNav';
import { ART } from './homeAssets';
import { CASHOUT, FAIR_PLAY, STAGE_LABEL, TOKEN, earningsFor, roadmapFor, utilitiesFor } from './tokenInfo';
import './home.css';
import './front.css';
import './classPage.css';
import './tokenPage.css';
import './responsive.css';

/** Goes to a part of the front page (its menu leads there too). */
const toFront = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(SCROLL_KEY, id);
  } catch {
    /* no storage: the page just opens at the top */
  }
  location.assign('/');
};

const SOON = 'Announced at launch';

/** The one official address, with a button to copy it (or the plain words, until there is one). */
function Mint({ mint }: { mint: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!mint) return <span className="tk-soon">{SOON}</span>;
  const copy = () => {
    void navigator.clipboard?.writeText(mint).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <span className="tk-mint">
      <code data-testid="token-mint">{mint}</code>
      <button type="button" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

/** `/token`: what the $SOLRIFT token is for in the game's economy. */
export function TokenPage() {
  const root = useRef<HTMLDivElement>(null);
  useFrontMotion(root);
  // The mint, supply and decimals come from the game server (its TOKEN_MINT), so the page and the game agree.
  const info: TokenLiveInfo | null = useToken((s) => s.info);
  const loadInfo = useToken((s) => s.loadInfo);
  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  useTokenBalance();
  const live = info?.live ?? false;
  const progress = { live, withdrawals: info?.withdrawals ?? false, clearRewards: info?.limits.clearRewards ?? [], slotPrices: info?.limits.slotPrices ?? [], stashPrices: info?.limits.stashPrices ?? [], bountyRewards: info?.limits.bountyRewards ?? [], keyPrice: info?.limits.keyPrice ?? 0, outfitPrices: info?.limits.outfitPrices ?? [] };
  const earnings = earningsFor(progress);
  const utilities = utilitiesFor(progress);
  const roadmap = roadmapFor(progress);
  const scrollTo = (to: string) => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // The page opens at the top, whatever the last page was scrolled to.
  useEffect(() => {
    document.getElementById('home-layer')?.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const play = () => {
    void import('./GameLobby').then(({ saveLobbyChoice }) => {
      saveLobbyChoice({ way: 'multi', mode: 'survival' });
      location.assign(lobbyUrl({ way: 'multi', mode: 'survival' }));
    });
  };

  const facts: [string, React.ReactNode][] = [
    ['Name', `${TOKEN.name} ($${TOKEN.ticker})`],
    ['Network', TOKEN.network],
    ['Standard', TOKEN.standard],
    ['Total supply', info?.supply ?? <span className="tk-soon">{SOON}</span>],
    ['Decimals', info?.decimals ?? <span className="tk-soon">{SOON}</span>],
    ['Official address', <Mint key="mint" mint={info?.mint ?? null} />],
  ];
  if (info?.live && info.cluster && info.cluster !== 'mainnet-beta') facts.splice(2, 0, ['Test network', `This is the ${info.cluster} test token, not the real one.`]);
  const links = [
    ['Explorer', info?.explorer?.token ?? TOKEN.links.explorer],
    ['Where to trade', TOKEN.links.trade],
    ['X', TOKEN.links.x],
    ['Discord', TOKEN.links.discord],
  ].filter((l): l is [string, string] => !!l[1]);

  return (
    <div className="fp cp tk" ref={root} style={{ '--c': '#ffb02e' } as CSSProperties}>
      <ClickSparks />

      <div className="fp-rail" data-no-play>
        <button className="fp-brand" onClick={() => toFront(null)} aria-label="SolRift, to the front page">
          <img src="/art/solrift-token-logo.png" alt="SolRift" draggable={false} />
        </button>
        <header className="fp-nav fp-px">
          <span className="fp-brand-gap" aria-hidden="true" />
          <nav className="site-nav fp-links" aria-label="Menu">
            <button className="fp-link-play" onClick={play}>
              Play
            </button>
            <button onClick={goBeyond}>The World</button>
            <button onClick={() => toFront('site-features')}>Classes</button>
            <button onClick={() => toFront('l-expansions')}>Expansions</button>
            <button className="fp-link-farm" onClick={goFarm}>Farm</button>
            <button className="fp-link-ranks" onClick={goRanks}>Ranks</button>
            <button className="fp-link-market" onClick={goMarket}>
              Market
            </button>
            <button className="fp-link-shop" onClick={goShop}>Shop</button>
            <button className="fp-link-token" aria-current="page" onClick={() => scrollTo('tk-top')}>
              Token
            </button>
          </nav>
          <div className="fp-account">
            <AccountPanel bar />
          </div>
          <i className="fp-progress" aria-hidden="true" />
        </header>
      </div>

      {/* ------------------------------------------------------------------ the top */}
      <section className="cp-hero tk-hero" id="tk-top">
        <div className="fp-art" aria-hidden="true">
          <div className="fp-art-m">
            <div className="fp-art-kb" style={{ backgroundImage: `url(${ART.hero})` }} />
          </div>
        </div>
        <div className="fp-rays" aria-hidden="true" />
        <div className="cp-wash" aria-hidden="true" />
        <Embers />
        <div className="cp-hero-in">
          <div className="cp-hero-copy">
            <nav className="cp-crumbs" aria-label="Where you are">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  toFront(null);
                }}
              >
                SolRift
              </a>
              <span aria-hidden="true">/</span>
              <b>Token</b>
            </nav>
            <p className="cp-role">Play. Earn. Cash out.</p>
            <h1 className="cp-name tk-title">
              <em>$SOLRIFT</em>
            </h1>
            <p className="cp-tagline">The Solana token you earn by playing</p>
            <p className="cp-lead">
              Win $SOLRIFT from bosses, dungeons, quests, crafting and trade. Spend it on the finest crafts and the keys to the deepest dungeons, or send it to your wallet and swap it for SOL or USDC.
            </p>
            <ul className="cp-badges" aria-label="The token">
              <li>Solana</li>
              <li>Earn by playing</li>
              <li>Withdraw to your wallet</li>
            </ul>
            <div className="cp-actions">
              <button className="fp-play fp-px" onClick={play}>
                <span>
                  <i aria-hidden="true" />
                  Play SolRift
                </span>
              </button>
              <button className="fp-ghost fp-px" onClick={() => scrollTo('tk-earn')}>
                <span>How to earn it</span>
              </button>
            </div>
          </div>
          <figure className="tk-coin" aria-hidden="true">
            <i className="tk-halo" />
            <img src="/art/solrift-token-logo.png" alt="" draggable={false} />
          </figure>
        </div>
      </section>

      <main className="fp-below">
        <div className="fp-orbs" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* ---------------------------------------------------------------- your balance (only once there is a token) */}
        {live && (
          <section className="fp-sec tk-sec" id="tk-wallet">
            <Reveal className="fp-head">
              <div>
                <small>
                  <b>00</b>
                  Yours
                </small>
                <h2>
                  Your <em>$SOLRIFT</em>
                </h2>
              </div>
              <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE]} />
            </Reveal>
            <TokenWallet />
          </section>
        )}

        {/* ---------------------------------------------------------------- the idea */}
        <section className="fp-sec tk-sec" id="tk-why">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>01</b>
                The idea
              </small>
              <h2>
                Two coins, two <em>jobs</em>
              </h2>
            </div>
            <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE]} />
          </Reveal>
          <div className="tk-two">
            <Reveal className="tk-coinbox fp-px">
              <small>Everyday money</small>
              <h3>Auren</h3>
              <p>Earned from monsters and quests, spent at shops, repairs and the Auction House. Plenty of it, always: it keeps the realm moving.</p>
              <ul>
                <li>Paid out by the game as you play</li>
                <li>Spent on gear, food and repairs</li>
                <li>Stays inside the game</li>
              </ul>
            </Reveal>
            <Reveal className="tk-coinbox gold fp-px" delay={0.08}>
              <small>The one you can keep</small>
              <h3>$SOLRIFT</h3>
              <p>A Solana token held in your own wallet. You earn it by playing, spend it on the things worth owning, or swap it for other crypto. What is spent in the game goes back to the treasury that pays the rewards.</p>
              <ul>
                <li>Earned by playing, paid from a fixed pool</li>
                <li>Lives on Solana, in your wallet</li>
                <li>Spent on crafting, keys, style and services</li>
                <li>Can be swapped for SOL or USDC</li>
              </ul>
            </Reveal>
          </div>
          <p className="tk-fine">The game is free to play and has no pay-to-win: nothing that makes a hero stronger is sold only for money.</p>
        </section>

        {/* ---------------------------------------------------------------- earning it */}
        <section className="fp-sec tk-sec" id="tk-earn">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>02</b>
                Earn
              </small>
              <h2>
                Play, and <em>earn</em>
              </h2>
            </div>
            <Blocks ids={[B.DIAMOND_ORE, B.GOLD_ORE, B.GLOWSTONE]} />
          </Reveal>
          <ul className="tk-uses tk-earns">
            {earnings.map((u, i) => (
              <Reveal as="li" key={u.id} delay={i * 0.05} className={`tk-use ${u.stage}`}>
                <div className="tk-use-top">
                  <span className="tk-tag">{u.how}</span>
                  <span className={`tk-stage ${u.stage}`}>{STAGE_LABEL[u.stage]}</span>
                </div>
                <h3>{u.title}</h3>
                <p>{u.text}</p>
                <span className={`tk-size ${u.size.toLowerCase()}`}>{u.size} reward</span>
              </Reveal>
            ))}
          </ul>
          <p className="tk-fine">
            {live && info
              ? `${info.limits.clearRewards.length > 0 ? 'Achievements and dungeon clears pay' : 'Achievements pay'} today, from a pool of ${info.limits.dailyPool.toLocaleString()} $SOLRIFT a day (${info.pool.paidToday.toLocaleString()} paid so far today). The rest is set by the daily reward pool and shown here as it goes live. It will change with the pool and with how many people play.`
              : 'How much each one pays is set by the daily reward pool and shown here once the token is live. It will change with the pool and with how many people play.'}
          </p>
        </section>

        {/* ---------------------------------------------------------------- achievements */}
        <section className="fp-sec tk-sec" id="tk-ach">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>03</b>
                Achievements
              </small>
              <h2>
                Deeds that <em>pay</em>
              </h2>
            </div>
            <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE, B.EMERALD_ORE]} />
          </Reveal>
          <p className="tk-lead">
            {ACHIEVEMENTS.length} achievements to win, from reaching level 5 to clearing the Hollow Deep twenty times. Each is won once per character, is kept with the character, pays once per wallet, and shows up in the game (open the quest log with L). Its tier decides the reward: Bronze for a first step, Mythic for a feat few will do.
          </p>
          <div className="tk-tiers">
            {ACH_TIER_ORDER.map((t) => (
              <span key={t} className={`tk-tier ${t}`}>
                {ACH_TIERS[t].name}
                <small>{ACHIEVEMENTS.filter((a) => a.tier === t).length}</small>
                {live && info && <small className="tk-pays">+{info.tiers[t].toLocaleString()}</small>}
              </span>
            ))}
          </div>
          <div className="tk-achs">
            {(Object.keys(ACH_CATEGORIES) as AchCategory[]).map((cat, i) => (
              <Reveal key={cat} delay={i * 0.04} className="tk-achcat">
                <h3>
                  {ACH_CATEGORIES[cat].name}
                  <em>{ACH_CATEGORIES[cat].blurb}</em>
                </h3>
                <ul>
                  {ACHIEVEMENTS.filter((a) => a.category === cat).map((a) => (
                    <li key={a.id} className={a.tier}>
                      <div>
                        <b>{a.name}</b>
                        <span>{a.text}</span>
                      </div>
                      <i className={`tk-tier ${a.tier}`}>
                        {ACH_TIERS[a.tier].name}
                        {live && info ? ` +${info.tiers[a.tier].toLocaleString()}` : ''}
                      </i>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
          <p className="tk-fine">
            {live
              ? 'Achievements are tracked by the game server, not by your browser, and cannot be bought or traded. The reward is paid into your balance the moment you win it, once per wallet (a hero you delete and make again cannot win it twice), and only in honest play. It counts against the day\'s pool and your own daily limit.'
              : 'Achievements are tracked by the game server, not by your browser, and cannot be bought or traded. The reward for each tier will be set with the token\'s reward pool and shown here once the token is live. Until then achievements are won and kept, and nothing is paid out.'}
          </p>
        </section>

        {/* ---------------------------------------------------------------- cashing out */}
        <section className="fp-sec tk-sec" id="tk-cash">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>04</b>
                Cash out
              </small>
              <h2>
                From coin to <em>cash</em>
              </h2>
            </div>
            <Blocks ids={[B.GOLD_ORE, B.PLANKS, B.GRASS]} />
          </Reveal>
          <ol className="cp-steps">
            {CASHOUT.map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.07}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
          <p className="tk-fine">
            Once $SOLRIFT is in your wallet it is a normal Solana token: its price is set by the people who trade it, not by SolRift, and it can go down as well as up. Exchanges and your bank may charge fees, and in some countries there is tax on what you earn: that is for you to check.
          </p>
        </section>

        {/* ---------------------------------------------------------------- fair play */}
        <section className="fp-sec tk-sec" id="tk-fair">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>05</b>
                Fair play
              </small>
              <h2>
                Keeping it <em>worth</em> something
              </h2>
            </div>
            <Blocks ids={[B.STONE, B.DIAMOND_ORE, B.GOLD_ORE]} />
          </Reveal>
          <ul className="mk-rules tk-rules">
            {FAIR_PLAY.map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.05}>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ul>
          {live && <TokenEconomy />}
        </section>

        {/* ---------------------------------------------------------------- the uses */}
        <section className="fp-sec tk-sec" id="tk-use">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>06</b>
                Utility
              </small>
              <h2>
                What you <em>spend</em> it on
              </h2>
            </div>
            <Blocks ids={[B.PLANKS, B.GOLD_ORE, B.GLOWSTONE]} />
          </Reveal>
          <ul className="tk-uses">
            {utilities.map((u, i) => (
              <Reveal as="li" key={u.id} delay={i * 0.05} className={`tk-use ${u.stage}`}>
                <div className="tk-use-top">
                  <span className="tk-tag">{u.tag}</span>
                  <span className={`tk-stage ${u.stage}`}>{STAGE_LABEL[u.stage]}</span>
                </div>
                <h3>{u.title}</h3>
                <p>{u.text}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- the flow */}
        <section className="fp-sec tk-sec" id="tk-flow">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>07</b>
                How it flows
              </small>
              <h2>
                A closed <em>loop</em>
              </h2>
            </div>
            <Blocks ids={[B.GRASS, B.PLANKS, B.GOLD_ORE]} />
          </Reveal>
          <ol className="cp-steps">
            {[
              ['Play', 'Fight bosses, clear dungeons and finish quests. The game pays Auren, and $SOLRIFT from the day\'s reward pool.'],
              ['Trade', 'Sell what you find and make to other players at the Auction House. Prices can be set in $SOLRIFT as well as Auren; a sale pays the seller at once.'],
              ['Spend or keep', 'Crafting, keys, outfits and services ask for $SOLRIFT, or you send it to your wallet. What is spent in the game goes back to the treasury.'],
              ['Back to the treasury', 'Everything spent in the game, from the house\'s cut to keys and crafting, returns to the treasury that funds the reward pool, so the loop keeps going.'],
            ].map(([t, text], i) => (
              <Reveal as="li" key={t} delay={i * 0.07}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- the details */}
        <section className="fp-sec tk-sec" id="tk-facts">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>08</b>
                The token
              </small>
              <h2>
                The <em>facts</em>
              </h2>
            </div>
            <Blocks ids={[B.STONE, B.DIAMOND_ORE]} />
          </Reveal>
          <Reveal className="tk-facts fp-px">
            <dl>
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {links.length > 0 && (
              <p className="tk-links">
                {links.map(([k, href]) => (
                  <a key={k} href={href} target="_blank" rel="noopener noreferrer">
                    {k}
                  </a>
                ))}
              </p>
            )}
          </Reveal>
          <p className="tk-warn" role="note">
            <b>Only trust this page.</b> The address above is the only official $SOLRIFT. Anyone who messages you with another one, or asks for your seed phrase, is a scam. SolRift will never ask for your seed phrase.
          </p>
        </section>

        {/* ---------------------------------------------------------------- the plan */}
        <section className="fp-sec tk-sec" id="tk-plan">
          <Reveal className="fp-head">
            <div>
              <small>
                <b>09</b>
                The plan
              </small>
              <h2>
                Where we <em>are</em>
              </h2>
            </div>
            <Blocks ids={[B.GRASS, B.STONE, B.GOLD_ORE]} />
          </Reveal>
          <ol className="tk-road">
            {roadmap.map((r, i) => (
              <Reveal as="li" key={r.title} delay={i * 0.05} className={r.stage}>
                <span className={`tk-stage ${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </Reveal>
            ))}
          </ol>
          <p className="tk-fine">
            This describes what the token is meant to do in the game. It is a plan, and parts of it will change as the game does. $SOLRIFT is a utility token for use in SolRift: it is not an investment, and nothing here promises a price, a return or any income from playing. What you earn depends on how you play, on the reward pool and on the market. Not financial advice.
          </p>
        </section>

        <section className="fp-sec fp-end">
          <Reveal>
            <div className="fp-pile">
              <Blocks ids={[B.GOLD_ORE, B.DIAMOND_ORE, B.PLANKS, B.GLOWSTONE, B.STONE]} size={72} />
            </div>
            <h2>
              Step through the <em>rift</em>
            </h2>
            <p>Free in your browser. Sign in with your Solana wallet and your adventure is yours.</p>
            <span className="fp-glow">
              <button className="fp-play fp-px" onClick={play}>
                <span>
                  <i aria-hidden="true" />
                  Play SolRift
                </span>
              </button>
            </span>
          </Reveal>
        </section>

        <footer className="fp-foot" data-no-play>
          <b>SolRift</b>
          <span>A voxel world in your browser, powered by Solana. Version {GAME_VERSION}.</span>
        </footer>
      </main>
    </div>
  );
}
