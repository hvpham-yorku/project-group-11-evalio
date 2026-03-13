import { SetupCourseProvider } from "@/app/setup/course-context";
import { ExploreScenarios } from "@/components/setup/ExploreScenarios";

export default function Page() {
	return (
		<SetupCourseProvider>
			<ExploreScenarios />
		</SetupCourseProvider>
	);
}
