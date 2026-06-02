/**
 * Rules + scoring documentation.
 *
 * Content mirrors api-usa/src/services/scoring.ts (cumulative stacking,
 * matchup-gated knockouts) and leaderboardService.ts (tiebreaker order).
 * If those rules change in the backend, mirror them here.
 */
export function RulesView() {
  return (
    <div className="rules">
      <h2 className="rules-h1">How TFP World Cup Picks works</h2>

      <p className="rules-lead">
        Fill in your bracket once before the submission deadline. You predict
        scorelines for every group-stage match and pick the winner of every
        knockout matchup. Your bracket cascades — the team you pick to win each
        round automatically becomes a side in the next round. Once submitted,
        your bracket is locked for the tournament.
      </p>

      <section className="rules-section">
        <h3 className="rules-h2">Submission</h3>
        <ul className="rules-list">
          <li>One bracket per player. Submission requires every group score AND every knockout winner picked.</li>
          <li><strong>Submissions close June 10, 11:59 PM.</strong> After that the bracket is locked — no edits.</li>
          <li>Knockout sides auto-fill from your group standings and your earlier round picks (cascade).</li>
        </ul>
      </section>

      <section className="rules-section">
        <h3 className="rules-h2">Scoring — group stage</h3>
        <p>Each group match is scored independently and points stack:</p>
        <table className="rules-table">
          <thead>
            <tr><th>Component</th><th>Points</th><th>What it means</th></tr>
          </thead>
          <tbody>
            <tr><td>Exact score</td><td className="num">+5</td><td>Both numbers right (e.g. you said 2–1, actual was 2–1)</td></tr>
            <tr><td>Goal difference</td><td className="num">+4</td><td>Right margin in the right direction (e.g. you said 3–2, actual 2–1)</td></tr>
            <tr><td>Outcome</td><td className="num">+3</td><td>Right winner, or both predicted a draw</td></tr>
          </tbody>
        </table>
        <p className="rules-note">
          Max per group match: <strong>12 points</strong> (5 + 4 + 3). An exact score
          always implies correct goal difference and outcome, so you collect all
          three components.
        </p>
      </section>

      <section className="rules-section">
        <h3 className="rules-h2">Scoring — knockouts (R32 → Final)</h3>
        <p>Knockout matches are <strong>matchup-gated</strong>. Your score components only fire if your bracket has the right two teams meeting at that slot:</p>
        <table className="rules-table">
          <thead>
            <tr><th>Component</th><th>Points</th><th>What it means</th></tr>
          </thead>
          <tbody>
            <tr><td>Exact score</td><td className="num">+5</td><td>Both numbers right AND your matchup matches the real matchup</td></tr>
            <tr><td>Goal difference</td><td className="num">+4</td><td>Right margin AND matchup matches</td></tr>
            <tr><td>Outcome</td><td className="num">+3</td><td>Right 90-minute outcome AND matchup matches</td></tr>
            <tr><td>Advancement</td><td className="num">+2</td><td>You picked the team that actually advanced (counts even if the matchup didn't match)</td></tr>
          </tbody>
        </table>
        <p className="rules-note">
          Max per knockout match: <strong>14 points</strong> (5 + 4 + 3 + 2). If your
          bracket has the wrong teams at a slot, the score components don't fire
          — but if your advancement pick still happens to advance, you still earn
          the +2 bonus.
        </p>
        <p className="rules-note">
          Penalty shootouts: the advancing team is whoever the admin records as
          the winner. Predict a draw at 90' and the right advancer to maximize.
        </p>
      </section>

      <section className="rules-section">
        <h3 className="rules-h2">Leaderboard &amp; tiebreakers</h3>
        <p>Players are ranked by:</p>
        <ol className="rules-list">
          <li>Total points (descending)</li>
          <li>Number of exact-score matches (descending)</li>
          <li>Number of correct outcomes (descending)</li>
          <li>Submission time — earlier wins. Editing a prediction resets that prediction's submission time, so submit confidently.</li>
        </ol>
      </section>

      <section className="rules-section">
        <h3 className="rules-h2">A few examples</h3>
        <ul className="rules-list">
          <li><strong>Group match:</strong> You said USA 2–1 Iran, actual was USA 3–2. Outcome ✓, GD ✓, Exact ✗ → <strong>7 pts</strong>.</li>
          <li><strong>Group match:</strong> You said USA 2–1 Iran, actual was USA 1–0. Outcome ✓, GD ✗ → <strong>3 pts</strong>.</li>
          <li><strong>Knockout (matchup matches):</strong> Predicted Brazil 2–1 France, actual was Brazil 2–1 France, and you also picked Brazil to advance → <strong>14 pts</strong>.</li>
          <li><strong>Knockout (matchup wrong):</strong> Your bracket had Brazil vs Argentina; actual was Brazil vs France. Even with an "exact" 2–1 guess, score components are 0. If you picked Brazil to advance and Brazil advanced → <strong>2 pts</strong>.</li>
        </ul>
      </section>
    </div>
  );
}
