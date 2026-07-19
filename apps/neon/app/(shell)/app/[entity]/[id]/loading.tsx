import {
  DocumentDetailSkeleton,
  RouteLoadingFrame,
} from "../../../../_components/loading/LoadingSkeletons";

export default function Loading() {
  return (
    <RouteLoadingFrame label="Loading record…">
      <DocumentDetailSkeleton />
    </RouteLoadingFrame>
  );
}
