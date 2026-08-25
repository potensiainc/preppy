type FontOptions = {
  variable?: string;
};

function testFont(options: FontOptions = {}) {
  return {
    className: "",
    style: { fontFamily: "sans-serif" },
    variable: options.variable ?? "",
  };
}

export const DM_Sans = testFont;
export const IBM_Plex_Sans_KR = testFont;
