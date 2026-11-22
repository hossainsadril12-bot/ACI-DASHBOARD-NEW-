import { SegmentedButtons } from "@/components/data/segmented";
import { QUARTER_TABS, type Quarter } from "./manual-drafts";

/** The quarter row above the Channel cost and FY tables (design 1.1). It picks which month columns show, nothing else. */
export function QuarterButtons({ value, onChange }: { value: Quarter; onChange: (q: Quarter) => void }) {
  return (
    <div data-testid="quarter-row" className="max-w-full overflow-x-auto">
      <SegmentedButtons label="Quarter" items={[...QUARTER_TABS]} value={value} onChange={onChange} />
    </div>
  );
}
