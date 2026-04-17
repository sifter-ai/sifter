"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SifterClient = void 0;
var errors_js_1 = require("./errors.js");
var folder_js_1 = require("./folder.js");
var sift_js_1 = require("./sift.js");
var SifterClient = /** @class */ (function () {
    function SifterClient(options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d;
        this._apiUrl = ((_a = options.apiUrl) !== null && _a !== void 0 ? _a : "http://localhost:8000").replace(/\/$/, "");
        var apiKey = (_c = (_b = options.apiKey) !== null && _b !== void 0 ? _b : (typeof globalThis !== "undefined" && "process" in globalThis
            ? globalThis.process.env["SIFTER_API_KEY"]
            : undefined)) !== null && _c !== void 0 ? _c : "";
        this._headers = apiKey ? { "X-API-Key": apiKey } : {};
        this._fetch = (_d = options.fetch) !== null && _d !== void 0 ? _d : globalThis.fetch;
    }
    SifterClient.prototype._siftHandle = function (data) {
        return new sift_js_1.SiftHandle(data, this._apiUrl, this._headers, this._fetch);
    };
    SifterClient.prototype._folderHandle = function (data) {
        return new folder_js_1.FolderHandle(data, this._apiUrl, this._headers, this._fetch);
    };
    // ---- Sift CRUD ----
    SifterClient.prototype.createSift = function (name_1, instructions_1) {
        return __awaiter(this, arguments, void 0, function (name, instructions, description) {
            var res, _a;
            if (description === void 0) { description = ""; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ name: name, instructions: instructions, description: description }),
                        })];
                    case 1:
                        res = _b.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _b.sent();
                        _a = this._siftHandle;
                        return [4 /*yield*/, res.json()];
                    case 3: return [2 /*return*/, _a.apply(this, [_b.sent()])];
                }
            });
        });
    };
    SifterClient.prototype.getSift = function (siftId) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts/").concat(siftId), {
                            headers: this._headers,
                        })];
                    case 1:
                        res = _b.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _b.sent();
                        _a = this._siftHandle;
                        return [4 /*yield*/, res.json()];
                    case 3: return [2 /*return*/, _a.apply(this, [_b.sent()])];
                }
            });
        });
    };
    SifterClient.prototype.listSifts = function () {
        return __awaiter(this, arguments, void 0, function (limit, offset) {
            var params, res, data;
            if (limit === void 0) { limit = 50; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/sifts?").concat(params), {
                                headers: this._headers,
                            })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.items];
                }
            });
        });
    };
    // ---- Folder CRUD ----
    SifterClient.prototype.createFolder = function (name_1) {
        return __awaiter(this, arguments, void 0, function (name, description) {
            var res, _a;
            if (description === void 0) { description = ""; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/folders"), {
                            method: "POST",
                            headers: __assign(__assign({}, this._headers), { "Content-Type": "application/json" }),
                            body: JSON.stringify({ name: name, description: description }),
                        })];
                    case 1:
                        res = _b.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _b.sent();
                        _a = this._folderHandle;
                        return [4 /*yield*/, res.json()];
                    case 3: return [2 /*return*/, _a.apply(this, [_b.sent()])];
                }
            });
        });
    };
    SifterClient.prototype.getFolder = function (folderId) {
        return __awaiter(this, void 0, void 0, function () {
            var res, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/folders/").concat(folderId), {
                            headers: this._headers,
                        })];
                    case 1:
                        res = _b.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _b.sent();
                        _a = this._folderHandle;
                        return [4 /*yield*/, res.json()];
                    case 3: return [2 /*return*/, _a.apply(this, [_b.sent()])];
                }
            });
        });
    };
    SifterClient.prototype.listFolders = function () {
        return __awaiter(this, arguments, void 0, function (limit, offset) {
            var params, res, data;
            if (limit === void 0) { limit = 50; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/folders?").concat(params), {
                                headers: this._headers,
                            })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.items];
                }
            });
        });
    };
    // ---- Document helpers ----
    SifterClient.prototype.documentPageCount = function (documentId) {
        return __awaiter(this, void 0, void 0, function () {
            var res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/documents/").concat(documentId, "/pages"), {
                            headers: this._headers,
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.total];
                }
            });
        });
    };
    SifterClient.prototype.documentPageImage = function (documentId_1) {
        return __awaiter(this, arguments, void 0, function (documentId, page, dpi) {
            var params, res;
            if (page === void 0) { page = 1; }
            if (dpi === void 0) { dpi = 150; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        params = new URLSearchParams({ dpi: String(dpi) });
                        return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/documents/").concat(documentId, "/pages/").concat(page, "/image?").concat(params), { headers: this._headers })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, res.arrayBuffer()];
                }
            });
        });
    };
    SifterClient.prototype.documentPages = function (documentId) {
        return __awaiter(this, void 0, void 0, function () {
            var res, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._fetch("".concat(this._apiUrl, "/api/documents/").concat(documentId, "/pages"), {
                            headers: this._headers,
                        })];
                    case 1:
                        res = _a.sent();
                        return [4 /*yield*/, (0, errors_js_1.assertOk)(res)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, res.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data.items];
                }
            });
        });
    };
    return SifterClient;
}());
exports.SifterClient = SifterClient;
