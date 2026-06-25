/* =====================================================================
   components.js — the four Lega World sub-components, ported verbatim
   from the Claude Design project (TeamBadge, BrandLogo, SeasonPanel,
   PlayerPicker). Logic/templates are unchanged except TeamBadge gains a
   graceful image fallback (broken/missing club PNG -> coloured monogram).
   ===================================================================== */
(function () {
  "use strict";

  /* ----------------------------- TeamBadge ----------------------------- */
  var TEAMBADGE_TPL =
    '<sc-if value="{{ isOfficial }}" hint-placeholder-val="{{ true }}">' +
      '<span style="{{ holderStyle }}"><img src="{{ imgSrc }}" alt="" style="{{ imgStyle }}" data-tb="1" onError="{{ onImgError }}" /></span>' +
    '</sc-if>' +
    '<sc-if value="{{ isMono }}" hint-placeholder-val="{{ true }}">' +
      '<span style="{{ monoStyle }}">{{ monoText }}</span>' +
    '</sc-if>';

  class TeamBadge extends DCLogic {
    renderVals() {
      const OFFICIAL = {
        "dynamo fc": "Dynamo_Football_Club.png",
        "golden stars": "Golden_Stars_PREVIEW_fonts-substituted.png",
        "mfm": "MFM_Football_Clb.png",
        "future stars": "Future_stars.png",
        "royal fc": "Royal_Football_Club.png",
        "fly eagles": "Fly_Eagles.png",
        "kings fc": "Kings_Football_club.png",
      };
      const MONO = {
        "winners team": ["WT", "#C03048"], "barnet fc": ["BA", "#9B2335"],
        "fc eagles": ["FE", "#2E7CB0"], "nova fc": ["NV", "#0E7A6E"],
        "spectrum": ["SP", "#7C5AA0"], "obc": ["OBC", "#000C3C"], "obc fc": ["OBC", "#000C3C"],
        "philadelphia fc": ["PH", "#1E5E8C"], "all stars": ["AS", "#B5791F"],
        "starlight": ["SL", "#54306C"], "the royals fc": ["TR", "#6B2D5C"],
        "leo fc": ["LE", "#8C5A1F"], "western boys": ["WB", "#1FA05A"],
        "adehun fc": ["AD", "#8C3A2B"], "ac carina": ["AC", "#2B6E6E"],
        "growing stars": ["GR", "#4A7C2F"],
      };
      const team = String(this.props.team || "").trim();
      const key = team.toLowerCase();
      const size = Number(this.props.size || 40);
      const rad = size >= 46 ? 14 : 8;

      // monogram label/colour — used for non-official clubs AND as the
      // fallback when an official badge image fails to load.
      let label, color;
      if (MONO[key]) { label = MONO[key][0]; color = MONO[key][1]; }
      else {
        const words = team.replace(/&/g, " ").split(/\s+/).filter(w => w && !/^(fc|team)$/i.test(w));
        label = (words.map(w => w[0]).join("").slice(0, 3) || team.slice(0, 2)).toUpperCase();
        color = "#48246C";
      }
      const monoStyle = `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${color};color:#fff;border-radius:${rad}px;box-sizing:border-box;flex:none;font-weight:800;font-size:${Math.max(9, Math.round(size * 0.34))}px;letter-spacing:.01em;line-height:1;`;

      const off = OFFICIAL[key];
      if (off) {
        return {
          isOfficial: true, isMono: false,
          imgSrc: "assets/clubs/" + off,
          holderStyle: `display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;padding:${Math.round(size * 0.12)}px;background:#fff;border:1px solid #E2ECEE;border-radius:${rad}px;box-sizing:border-box;flex:none;`,
          imgStyle: "max-width:100%;max-height:100%;object-fit:contain;",
          onImgError: (e) => {
            const img = e.target, holder = img.parentNode;
            if (holder && holder.parentNode) {
              const span = document.createElement("span");
              span.setAttribute("style", monoStyle);
              span.textContent = label;
              holder.parentNode.replaceChild(span, holder);
            }
          },
        };
      }
      return { isOfficial: false, isMono: true, monoText: label, monoStyle: monoStyle };
    }
  }
  DC.register("TeamBadge", TEAMBADGE_TPL, TeamBadge);

  /* ----------------------------- BrandLogo ----------------------------- */
  // A plain <img>; if the source fails, the global image fallback in
  // app.js swaps it for an on-brand emblem.
  var BRANDLOGO_TPL =
    '<img src="{{ src }}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />';
  DC.register("BrandLogo", BRANDLOGO_TPL, null);

  /* ----------------------------- SeasonPanel ----------------------------- */
  // Stateless: renders directly from its `season` prop.
  var SEASONPANEL_TPL =
'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;align-items:start;">\n' +
'  <div style="display:flex;flex-direction:column;gap:20px;min-width:0;">\n' +
'    <sc-if value="{{ season.hasTable }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:12px 14px;background:#48246C;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"><span>#</span><span>Club</span><span style="text-align:center;">W</span><span style="text-align:center;">T</span><span style="text-align:center;">L</span><span style="text-align:center;">GF</span><span style="text-align:center;">GA</span><span style="text-align:center;">Pts</span></div>\n' +
'        <sc-for list="{{ season.tableRows }}" as="r" hint-placeholder-count="8">\n' +
'          <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:9px 14px;font-size:13px;border-top:1px solid #EEF4F4;">\n' +
'            <span style="font-weight:700;color:#067C7C;">{{ r.pos }}</span>\n' +
'            <span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ r.team }}" size="24" hint-size="24px,24px"></dc-import><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.team }}</span></span>\n' +
'            <span style="text-align:center;font-weight:300;font-variant-numeric:tabular-nums;">{{ r.w }}</span><span style="text-align:center;font-weight:300;font-variant-numeric:tabular-nums;">{{ r.t }}</span><span style="text-align:center;font-weight:300;font-variant-numeric:tabular-nums;">{{ r.l }}</span><span style="text-align:center;font-weight:300;font-variant-numeric:tabular-nums;">{{ r.gf }}</span><span style="text-align:center;font-weight:300;font-variant-numeric:tabular-nums;">{{ r.ga }}</span><span style="text-align:center;font-weight:800;color:#48246C;font-variant-numeric:tabular-nums;">{{ r.pts }}</span>\n' +
'          </div>\n' +
'        </sc-for>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasDiv }}" hint-placeholder-val="{{ true }}">\n' +
'      <sc-for list="{{ season.divisions }}" as="d" hint-placeholder-count="2">\n' +
'        <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'          <div style="padding:11px 14px;background:#2C1545;color:#fff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">{{ d.name }}</div>\n' +
'          <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:10px 14px;background:#48246C;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"><span>#</span><span>Club</span><span style="text-align:center;">W</span><span style="text-align:center;">T</span><span style="text-align:center;">L</span><span style="text-align:center;">GF</span><span style="text-align:center;">GA</span><span style="text-align:center;">Pts</span></div>\n' +
'          <sc-for list="{{ d.rows }}" as="r" hint-placeholder-count="6">\n' +
'            <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:9px 14px;font-size:13px;border-top:1px solid #EEF4F4;">\n' +
'              <span style="font-weight:700;color:#067C7C;">{{ r.pos }}</span>\n' +
'              <span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ r.team }}" size="24" hint-size="24px,24px"></dc-import><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.team }}</span></span>\n' +
'              <span style="text-align:center;font-weight:300;">{{ r.w }}</span><span style="text-align:center;font-weight:300;">{{ r.t }}</span><span style="text-align:center;font-weight:300;">{{ r.l }}</span><span style="text-align:center;font-weight:300;">{{ r.gf }}</span><span style="text-align:center;font-weight:300;">{{ r.ga }}</span><span style="text-align:center;font-weight:800;color:#48246C;">{{ r.pts }}</span>\n' +
'            </div>\n' +
'          </sc-for>\n' +
'        </div>\n' +
'      </sc-for>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasGroups }}" hint-placeholder-val="{{ true }}">\n' +
'      <sc-for list="{{ season.groups }}" as="d" hint-placeholder-count="2">\n' +
'        <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'          <div style="padding:11px 14px;background:#2C1545;color:#fff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">{{ d.name }}</div>\n' +
'          <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:10px 14px;background:#48246C;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"><span>#</span><span>Club</span><span style="text-align:center;">W</span><span style="text-align:center;">T</span><span style="text-align:center;">L</span><span style="text-align:center;">GF</span><span style="text-align:center;">GA</span><span style="text-align:center;">Pts</span></div>\n' +
'          <sc-for list="{{ d.rows }}" as="r" hint-placeholder-count="4">\n' +
'            <div style="display:grid;grid-template-columns:32px 1fr 26px 26px 26px 34px 34px 42px;align-items:center;padding:9px 14px;font-size:13px;border-top:1px solid #EEF4F4;">\n' +
'              <span style="font-weight:700;color:#067C7C;">{{ r.pos }}</span>\n' +
'              <span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ r.team }}" size="24" hint-size="24px,24px"></dc-import><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.team }}</span></span>\n' +
'              <span style="text-align:center;font-weight:300;">{{ r.w }}</span><span style="text-align:center;font-weight:300;">{{ r.t }}</span><span style="text-align:center;font-weight:300;">{{ r.l }}</span><span style="text-align:center;font-weight:300;">{{ r.gf }}</span><span style="text-align:center;font-weight:300;">{{ r.ga }}</span><span style="text-align:center;font-weight:800;color:#48246C;">{{ r.pts }}</span>\n' +
'            </div>\n' +
'          </sc-for>\n' +
'        </div>\n' +
'      </sc-for>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasFinal }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#48246C;color:#fff;border-radius:18px;padding:20px;">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#90C0E4;margin-bottom:12px;">The Final</div>\n' +
'        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;">\n' +
'          <span style="display:flex;align-items:center;gap:9px;justify-content:flex-end;min-width:0;"><span style="font-weight:700;font-size:15px;">{{ season.final.home }}</span><dc-import name="TeamBadge" team="{{ season.final.home }}" size="34" hint-size="34px,34px"></dc-import></span>\n' +
'          <span style="font-weight:300;font-size:26px;font-variant-numeric:tabular-nums;min-width:64px;text-align:center;">{{ season.final.hs }} &ndash; {{ season.final.as }}</span>\n' +
'          <span style="display:flex;align-items:center;gap:9px;min-width:0;"><dc-import name="TeamBadge" team="{{ season.final.away }}" size="34" hint-size="34px,34px"></dc-import><span style="font-weight:700;font-size:15px;">{{ season.final.away }}</span></span>\n' +
'        </div>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasResults }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:12px;">{{ season.resultsLabel }}</div>\n' +
'        <div style="display:flex;flex-direction:column;gap:6px;">\n' +
'          <sc-for list="{{ season.results }}" as="m" hint-placeholder-count="4">\n' +
'            <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #EEF4F4;">\n' +
'              <span style="display:flex;align-items:center;gap:8px;justify-content:flex-end;min-width:0;"><span style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ m.home }}</span><dc-import name="TeamBadge" team="{{ m.home }}" size="26" hint-size="26px,26px"></dc-import></span>\n' +
'              <span style="font-weight:300;font-size:17px;color:#48246C;font-variant-numeric:tabular-nums;min-width:54px;text-align:center;">{{ m.hs }} &ndash; {{ m.as }}</span>\n' +
'              <span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ m.away }}" size="26" hint-size="26px,26px"></dc-import><span style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ m.away }}</span></span>\n' +
'            </div>\n' +
'          </sc-for>\n' +
'        </div>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasFixtures }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:12px;">Draw</div>\n' +
'        <div style="display:flex;flex-direction:column;gap:6px;">\n' +
'          <sc-for list="{{ season.fixtures }}" as="m" hint-placeholder-count="4">\n' +
'            <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #EEF4F4;">\n' +
'              <span style="display:flex;align-items:center;gap:8px;justify-content:flex-end;min-width:0;"><span style="font-weight:600;font-size:13px;">{{ m.home }}</span><dc-import name="TeamBadge" team="{{ m.home }}" size="26" hint-size="26px,26px"></dc-import></span>\n' +
'              <span style="font-size:11px;font-weight:700;color:#5C5470;">VS</span>\n' +
'              <span style="display:flex;align-items:center;gap:8px;min-width:0;"><dc-import name="TeamBadge" team="{{ m.away }}" size="26" hint-size="26px,26px"></dc-import><span style="font-weight:600;font-size:13px;">{{ m.away }}</span></span>\n' +
'            </div>\n' +
'          </sc-for>\n' +
'        </div>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'\n' +
'    <sc-if value="{{ season.hasRegistered }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:18px;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:12px;">Teams registered</div>\n' +
'        <div style="display:flex;gap:10px;flex-wrap:wrap;">\n' +
'          <sc-for list="{{ season.registered }}" as="t" hint-placeholder-count="4"><span style="display:flex;align-items:center;gap:8px;background:#EAF3F3;border-radius:999px;padding:6px 14px 6px 6px;"><dc-import name="TeamBadge" team="{{ t }}" size="24" hint-size="24px,24px"></dc-import><span style="font-weight:600;font-size:13px;">{{ t }}</span></span></sc-for>\n' +
'        </div>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'  </div>\n' +
'\n' +
'  <div style="display:flex;flex-direction:column;gap:20px;min-width:0;">\n' +
'    <sc-if value="{{ season.hasScorers }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:20px;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:8px;">Top scorers</div>\n' +
'        <sc-for list="{{ season.scorers }}" as="r" hint-placeholder-count="5">\n' +
'          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #EEF4F4;">\n' +
'            <span style="width:18px;font-weight:800;color:#48246C;">{{ r.rank }}</span>\n' +
'            <dc-import name="TeamBadge" team="{{ r.team }}" size="26" hint-size="26px,26px"></dc-import>\n' +
'            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.name }}</div><div style="font-size:11px;font-weight:500;color:#5C5470;">{{ r.team }}</div></div>\n' +
'            <span style="font-weight:300;font-size:21px;font-variant-numeric:tabular-nums;">{{ r.goals }}</span>\n' +
'          </div>\n' +
'        </sc-for>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'    <sc-if value="{{ season.hasAssists }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px solid #E2ECEE;border-radius:18px;padding:20px;box-shadow:0 1px 3px rgba(44,21,69,.08);">\n' +
'        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#067C7C;margin-bottom:8px;">Top assists</div>\n' +
'        <sc-for list="{{ season.assists }}" as="r" hint-placeholder-count="3">\n' +
'          <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #EEF4F4;">\n' +
'            <span style="width:18px;font-weight:800;color:#067C7C;">{{ r.rank }}</span>\n' +
'            <dc-import name="TeamBadge" team="{{ r.team }}" size="26" hint-size="26px,26px"></dc-import>\n' +
'            <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;">{{ r.name }}</div><div style="font-size:11px;font-weight:500;color:#5C5470;">{{ r.team }}</div></div>\n' +
'            <span style="font-weight:300;font-size:21px;font-variant-numeric:tabular-nums;color:#067C7C;">{{ r.val }}</span>\n' +
'          </div>\n' +
'        </sc-for>\n' +
'      </div>\n' +
'    </sc-if>\n' +
'    <sc-if value="{{ season.empty }}" hint-placeholder-val="{{ true }}">\n' +
'      <div style="background:#fff;border:1px dashed #CFC0E0;border-radius:18px;padding:28px;text-align:center;color:#5C5470;font-weight:500;">No match data recorded for this season yet.</div>\n' +
'    </sc-if>\n' +
'  </div>\n' +
'</div>';
  DC.register("SeasonPanel", SEASONPANEL_TPL, null);

  /* ----------------------------- PlayerPicker ----------------------------- */
  var PLAYERPICKER_TPL =
'<div style="position:relative;">\n' +
'  <sc-if value="{{ hasValue }}" hint-placeholder-val="{{ false }}">\n' +
'    <div style="display:flex;align-items:center;gap:10px;background:#F3EEFA;border:1px solid #CFC0E0;border-radius:10px;padding:8px 10px;margin-bottom:8px;">\n' +
'      <dc-import name="TeamBadge" team="{{ valTeam }}" size="30" hint-size="30px,30px"></dc-import>\n' +
'      <div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ value }}</div><div style="font-size:11px;color:#5C5470;font-weight:500;">{{ valTeam }}</div></div>\n' +
'      <span onClick="{{ clear }}" style="cursor:pointer;font-size:16px;font-weight:700;color:#5C5470;padding:0 4px;">&times;</span>\n' +
'    </div>\n' +
'  </sc-if>\n' +
'  <input value="{{ query }}" onInput="{{ onInput }}" onFocus="{{ onFocus }}" placeholder="{{ ph }}" style="width:100%;font-size:15px;font-weight:600;padding:11px 13px;border:1px solid #E2ECEE;border-radius:8px;background:#FAFCFC;color:#281F38;box-sizing:border-box;" />\n' +
'  <sc-if value="{{ open }}" hint-placeholder-val="{{ false }}">\n' +
'    <div style="position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #E2ECEE;border-radius:10px;box-shadow:0 8px 26px rgba(44,21,69,.16);max-height:280px;overflow-y:auto;z-index:50;">\n' +
'      <sc-for list="{{ results }}" as="r" hint-placeholder-count="0"><div onMouseDown="{{ r.pick }}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid #F2F6F6;" style-hover="background:#F3EEFA;"><dc-import name="TeamBadge" team="{{ r.team }}" size="26" hint-size="26px,26px"></dc-import><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ r.name }}</div><div style="font-size:11px;color:#5C5470;font-weight:500;">{{ r.team }}</div></div></div></sc-for>\n' +
'      <sc-if value="{{ noResults }}" hint-placeholder-val="{{ false }}"><div style="padding:14px;text-align:center;color:#5C5470;font-weight:500;font-size:13px;">No players found</div></sc-if>\n' +
'    </div>\n' +
'  </sc-if>\n' +
'</div>';

  // MAX_RESULTS small + a short input debounce keep the dropdown cheap to
  // render: while the user is mid-type the rows are not built at all (only the
  // input re-renders), and they appear once typing settles. This is what keeps
  // search responsive on low-end devices (40 badge-rows/keystroke used to hang).
  var PP_MAX_RESULTS = 8;
  var PP_DEBOUNCE_MS = 140;

  class PlayerPicker extends DCLogic {
    constructor(props) { super(props); this.state = { query: "", open: false, settled: true }; }
    renderVals() {
      const players = this.props.players || [];
      const q = (this.state.query || "").trim().toLowerCase();
      let list = players;
      if (q) list = players.filter(p => String(p.name).toLowerCase().indexOf(q) >= 0);
      // only build/show the result rows once typing has settled
      const ready = this.state.open && q.length > 0 && this.state.settled;
      const results = ready
        ? list.slice(0, PP_MAX_RESULTS).map(p => ({ name: p.name, team: p.team, pick: () => { clearTimeout(this._t); this.setState({ query: "", open: false, settled: true }); if (this.props.onpick) this.props.onpick(p.name); } }))
        : [];
      const val = this.props.value || "";
      const found = players.find(p => p.name === val);
      return {
        query: this.state.query, open: ready,
        results: results, noResults: ready && results.length === 0,
        hasValue: !!val, value: val, valTeam: found ? found.team : val,
        ph: val ? "Type to change…" : (this.props.placeholder || "Search players…"),
        onInput: (e) => {
          const v = e.target.value;
          this.setState({ query: v, open: true, settled: false });
          clearTimeout(this._t);
          this._t = setTimeout(() => this.setState({ settled: true }), PP_DEBOUNCE_MS);
        },
        onFocus: () => this.setState({ open: true, settled: true }),
        clear: () => { clearTimeout(this._t); this.setState({ query: "", settled: true }); if (this.props.onpick) this.props.onpick(""); },
      };
    }
  }
  DC.register("PlayerPicker", PLAYERPICKER_TPL, PlayerPicker, { stateful: true });
})();
