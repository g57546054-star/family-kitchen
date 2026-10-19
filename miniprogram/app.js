const { createRepository, wxStorage } = require("./services/repository");
const { createDisabledFamilyProvider } = require("./services/family-provider");

App({
  onLaunch() {
    // No CloudBase initialization, login, network request, or environment creation.
    this.repository = createRepository(wxStorage(wx));
    this.familyProvider = createDisabledFamilyProvider();
  },
});
