import {
  GenericPageSkeleton,
  RouteLoadingFrame,
} from "../_components/loading/LoadingSkeletons";

export default function Loading() {
  return (
    <RouteLoadingFrame label="Loading page…">
      <GenericPageSkeleton />
    </RouteLoadingFrame>
  );
}
