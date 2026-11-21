import { describe, expect, it } from "vitest";
import { tunnelPrivacyWarning } from "./tunnel";

describe("tunnelPrivacyWarning", () => {
  it("names the user whose shell the URL exposes", () => {
    expect(tunnelPrivacyWarning("ada", false)).toContain('as "ada"');
  });

  it("tells the reader to keep the URL private either way", () => {
    expect(tunnelPrivacyWarning("ada", false)).toContain("Keep this URL private");
    expect(tunnelPrivacyWarning("ada", true)).toContain("Keep this URL private");
  });

  it("points at the setting when no password is set", () => {
    const warning = tunnelPrivacyWarning("ada", false);
    expect(warning).toContain("There is no login");
    expect(warning).toMatch(/access password in Settings/i);
  });

  it("does not claim there is no login once a password is set", () => {
    const warning = tunnelPrivacyWarning("ada", true);
    expect(warning).not.toContain("There is no login");
    expect(warning).toMatch(/have to log in/i);
  });
});
