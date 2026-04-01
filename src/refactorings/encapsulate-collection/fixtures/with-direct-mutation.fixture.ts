export const params = { file: "fixture.ts", target: "Playlist", field: "tracks" };

class Playlist {
  title: string = "My Mix";
  tracks: string[] = [];

  getTitle(): string {
    return this.title;
  }
}

export function main(): string {
  const pl = new Playlist();
  return pl.getTitle();
}
