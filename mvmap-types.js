/* Vocabulary shared with the UE whitebox importer. Edit this file, not index.html.
   Loaded by index.html as a classic <script> (exposes window.MVMapTypes) and by node tests via require().

   regions: must match ENSRegionList in NSProject Source/NSProject/Global/NSGlobal_Level.h
            (InvalidRegion is left out; an area with no region selected means "not set").
     label  - shown in the editor, same as the enum's DisplayName
     region - the enum value name, used for sub-level names (XianZuCi_Room_B01_LD)
     letter - used in room codes and FacilityID tags (B01) */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MVMapTypes = api;
})(this, function () {
  "use strict";
  return {
    regions: [
      { label: "A_傩愿寨", region: "NuoYuanZhai", letter: "A" },
      { label: "B_先祖祠", region: "XianZuCi", letter: "B" },
      { label: "C_南野坪", region: "NanYePing", letter: "C" },
      { label: "D_悬净山山麓", region: "ShanLu", letter: "D" },
      { label: "E_息烽岗", region: "XiFengGang", letter: "E" },
      { label: "F_水甲寨", region: "ShuiJiaZhai", letter: "F" },
      { label: "G_止煞湖", region: "ZhiShaHu", letter: "G" },
      { label: "H_风雨桥", region: "FengYuQiao", letter: "H" },
      { label: "J_蛊寨", region: "GuZhai", letter: "J" },
      { label: "K_悬净山地缝", region: "DiFeng", letter: "K" },
      { label: "L_混沌", region: "HunDun", letter: "L" },
    ],
  };
});
