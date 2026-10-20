const { createRepository, wxStorage } = require("./services/repository");
const {
  createFamilyProvider,
  createWeChatTransport,
  createModeRepository,
} = require("./services/family-provider");
App({
  onLaunch() {
    this.localRepository = createRepository(wxStorage(wx));
    this.familyProvider = createFamilyProvider({
      localRepository: this.localRepository,
      transport: createWeChatTransport(wx),
      storage: wxStorage(wx),
    });
    this.repository = createModeRepository(
      this.localRepository,
      this.familyProvider,
    );
  },
});
