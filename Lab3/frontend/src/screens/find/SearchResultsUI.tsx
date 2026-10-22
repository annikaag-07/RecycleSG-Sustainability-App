import { PlaceholderScreen } from '@/shared/components';

export default function SearchResultsUI() {
  return (
    <PlaceholderScreen
      name="SearchResultsUI"
      owner="Person A (Pranav)"
      useCase="2.1 Find a recycling point for an item"
      leading="back"
      links={[
        { label: 'Point detail (sample id 1)', href: '/find/point/1' },
      ]}
    />
  );
}
