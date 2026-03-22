import type { PermissionGrant } from "@shared/contracts";

type ApprovalQueueProps = {
  approvals: PermissionGrant[];
  onToggle: (grant: PermissionGrant) => void;
};

export function ApprovalQueue({ approvals, onToggle }: ApprovalQueueProps) {
  return (
    <section className="surface dock-card">
      <div className="dock-header">
        <div>
          <p className="eyebrow">Approval queue</p>
          <h3>LLM permissions</h3>
        </div>
      </div>
      <div className="approval-list">
        {approvals.map((approval, index) => (
          <article className="approval-item" key={`${approval.target}-${approval.access}-${index}`}>
            <div>
              <strong>{approval.target}</strong>
              <p>{approval.audit_note ?? "No audit note provided."}</p>
            </div>
            <button className="action-button secondary" onClick={() => onToggle(approval)} type="button">
              {approval.approved ? "Revoke" : "Approve patch"}
            </button>
          </article>
        ))}
        {approvals.length === 0 ? <p className="muted-copy">No approval history yet.</p> : null}
      </div>
    </section>
  );
}
