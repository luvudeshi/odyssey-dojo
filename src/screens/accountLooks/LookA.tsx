// Look A, "Penelope's loom": the record is a tapestry on the loom at Ithaca. A deed won is woven in wool, one colour to a
// group, with stitched edges; a deed not won is bare warp thread, the cloth not yet woven. Warm, sunlit, light.
import { Icon } from "../../account/ui/icons";
import { Button } from "../../ui/pebble";
import "./lookA.css";
import { Detail, NameField, Stats, aria, groupsOf, hoverEvents, iconOf, useStage, type LookProps } from "./shared";

export function LookA(props: LookProps) {
  const { profile, feats, activeId } = props;
  const { stageStyle, coreStyle } = useStage();
  const groups = groupsOf(feats);
  const by = (key: string) => groups.find((group) => group.key === key);
  const picked = feats.find((feat) => feat.id === activeId);
  const won = feats.filter((feat) => feat.done).length;
  const section = (key: string) => {
    const group = by(key);
    if (!group) return null;
    return (
      <section key={key} className={`lk-a-group lk-a-group--${key}`} style={{ gridColumn: `span ${String(group.feats.length)}` }} aria-label={group.title}>
        <h2><span>{group.title}</span><b>{group.feats.filter((feat) => feat.done).length}/{group.feats.length}</b></h2>
        <ul style={{ gridTemplateColumns: `repeat(${String(group.feats.length)}, 1fr)` }}>
          {group.feats.map((feat) => (
            <li key={feat.id}>
              <button type="button" className={`lk-a-cell ${feat.done ? "is-done" : "is-locked"} ${activeId === feat.id ? "is-active" : ""}`} aria-label={aria(feat)} {...hoverEvents(props.setActiveId, feat.id)}>
                <Icon name={iconOf(feat)} className="lk-a-cell__icon" />
                <span className="lk-a-cell__name">{feat.name}</span>
                {feat.progress && !feat.done && <small>{feat.progress.have}/{feat.progress.goal}</small>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  return (
    <main className="lk lk-a">
      <div className="lk-stage" style={stageStyle}>
        <div className="lk-core" style={coreStyle}>
          <div className="lk-a-post lk-a-post--l" aria-hidden="true" />
          <div className="lk-a-post lk-a-post--r" aria-hidden="true" />
          <div className="lk-a-beam" aria-hidden="true" />
          <div className="lk-a-fringe" aria-hidden="true" />
          <div className="lk-a-weights" aria-hidden="true" />
          <div className="lk-a-cloth">
            <header className="lk-a-head">
              <h1><span>Account</span>The Loom of Penelope</h1>
              <NameField name={profile.name} max={44} room={330} />
              <Stats profile={profile} />
            </header>
            <div className="lk-a-zig" aria-hidden="true" />
            <div className="lk-a-band">{section("road")}</div>
            <div className="lk-a-band">{section("arms")}{section("dojo")}</div>
            <div className="lk-a-band">
              {section("labours")}
              <p className="lk-a-count"><b>{won}</b>of {feats.length}<br />woven</p>
            </div>
            <div className="lk-a-zig" aria-hidden="true" />
            <footer className="lk-a-foot">
              <Detail feat={picked ?? feats.find((feat) => !feat.done)} picked={picked !== undefined} doneText="The cloth is finished" />
              <div className="lk-actions">
                <Button onClick={props.onSettings}><Icon name="sliders" className="lk-btn__icon" />Open settings</Button>
                <Button primary onClick={props.onBack}><Icon name="house" className="lk-btn__icon" />Main menu</Button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
