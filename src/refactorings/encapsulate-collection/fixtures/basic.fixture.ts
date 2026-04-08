export const params = { file: "fixture.ts", target: "Course", field: "prerequisites" };

class Course {
  name: string = "";
  prerequisites: string[] = [];
}

export function main(): string {
  const course = new Course();
  course.name = "Advanced TypeScript";
  course.prerequisites.push("JavaScript Basics");
  course.prerequisites.push("TypeScript Intro");
  return `${course.name} requires: ${course.prerequisites.join(", ")}`;
}
