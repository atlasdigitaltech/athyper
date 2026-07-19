import {
  DashboardSkeleton,
  RouteLoadingFrame,
} from "../../_components/loading/LoadingSkeletons";

export default function Loading() {
  return (
    <RouteLoadingFrame label="Loading dashboard…">
      <DashboardSkeleton />
    </RouteLoadingFrame>
  );
}
