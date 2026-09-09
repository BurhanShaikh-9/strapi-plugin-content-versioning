import React, { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Typography,
  Badge,
  Dialog,
} from "@strapi/design-system";
import { Clock, Eye, Duplicate, Check } from "@strapi/icons";
import { format, parseISO } from "date-fns";

const SYSTEM_KEYS = new Set([
  "id",
  "documentId",
  "vuid",
  "versionNumber",
  "versionComment",
  "versionData",
  "isVisibleInListView",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "createdBy",
  "updatedBy",
  "locale",
  "localizations",
  "author",
  "isCurrent",
]);

const renderPrimitiveValue = (val) => {
  if (val === null || val === undefined || val === "") {
    return (
      <Typography variant="omega" style={{ color: "#8e8ea9", fontStyle: "italic" }}>
        (empty)
      </Typography>
    );
  }
  if (typeof val === "boolean") {
    return (
      <Badge style={{ backgroundColor: val ? "#eafbe7" : "#fee2e2", color: val ? "#277c22" : "#b91c1c" }}>
        {val ? "true" : "false"}
      </Badge>
    );
  }
  if (typeof val === "number") {
    return <Typography variant="omega" fontWeight="bold" textColor="neutral800">{String(val)}</Typography>;
  }
  return (
    <Typography variant="omega" textColor="neutral800" style={{ wordBreak: "break-word" }}>
      {String(val)}
    </Typography>
  );
};

const isMediaObject = (obj) =>
  obj && typeof obj === "object" && (obj.url || obj.mime || obj.hash);

const renderMediaValue = (media) => {
  const name = media.name || media.hash || "Media";
  const url = media.url;
  return (
    <Flex gap={2} alignItems="center" wrap="wrap">
      {url && (
        <img
          src={url.startsWith("http") ? url : `${window?.location?.origin || ""}${url}`}
          alt={name}
          style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px", border: "1px solid #eaeaef" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <Badge style={{ backgroundColor: "#f0f0ff", color: "#4945ff" }}>
        {name}
      </Badge>
    </Flex>
  );
};

const renderNestedObject = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object") return renderPrimitiveValue(obj);
  if (isMediaObject(obj)) return renderMediaValue(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return (
        <Typography variant="pi" style={{ color: "#8e8ea9", fontStyle: "italic" }}>
          (empty list)
        </Typography>
      );
    }

    return (
      <Flex direction="column" gap={2} alignItems="stretch" style={{ width: "100%" }}>
        {obj.map((item, idx) => {
          if (!item || typeof item !== "object") {
            return <Box key={idx}>{renderPrimitiveValue(item)}</Box>;
          }
          if (isMediaObject(item)) {
            return <Box key={idx}>{renderMediaValue(item)}</Box>;
          }
          const compName = item.__component;
          const cleanEntries = Object.entries(item).filter(
            ([k]) => k !== "id" && k !== "__component" && k !== "createdAt" && k !== "updatedAt"
          );

          return (
            <Box
              key={item.id || idx}
              padding={2}
              style={{
                backgroundColor: "#fdfdfd",
                border: "1px solid #eaeaef",
                borderRadius: "6px",
                width: "100%",
              }}
            >
              {compName && (
                <Box marginBottom={cleanEntries.length > 0 ? 2 : 0}>
                  <Badge style={{ backgroundColor: "#e0e1fb", color: "#4945ff", fontWeight: "600" }}>
                    {compName}
                  </Badge>
                </Box>
              )}
              {cleanEntries.length === 0 ? (
                <Typography variant="pi" style={{ color: "#8e8ea9", fontStyle: "italic" }}>
                  (no extra fields)
                </Typography>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <tbody>
                    {cleanEntries.map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px solid #f6f6f9" }}>
                        <td style={{ padding: "4px 8px", color: "#666687", fontWeight: "600", width: "35%", verticalAlign: "top" }}>
                          {k}
                        </td>
                        <td style={{ padding: "4px 8px", verticalAlign: "top" }}>
                          {typeof v === "object" && v !== null && depth < 3
                            ? renderNestedObject(v, depth + 1)
                            : renderPrimitiveValue(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Box>
          );
        })}
      </Flex>
    );
  }

  // Single component / object
  const cleanEntries = Object.entries(obj).filter(
    ([k]) => k !== "id" && k !== "__component" && k !== "createdAt" && k !== "updatedAt"
  );
  if (cleanEntries.length === 0) {
    return (
      <Typography variant="pi" style={{ color: "#8e8ea9", fontStyle: "italic" }}>
        (empty)
      </Typography>
    );
  }

  return (
    <Box
      padding={2}
      style={{
        backgroundColor: "#fdfdfd",
        border: "1px solid #eaeaef",
        borderRadius: "6px",
        width: "100%",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <tbody>
          {cleanEntries.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: "1px solid #f6f6f9" }}>
              <td style={{ padding: "4px 8px", color: "#666687", fontWeight: "600", width: "35%", verticalAlign: "top" }}>
                {k}
              </td>
              <td style={{ padding: "4px 8px", verticalAlign: "top" }}>
                {typeof v === "object" && v !== null && depth < 3
                  ? renderNestedObject(v, depth + 1)
                  : renderPrimitiveValue(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
};

const renderComplexValue = (val) => {
  return renderNestedObject(val, 0);
};

const RevisionPreviewModal = ({
  isOpen,
  onClose,
  revision,
}) => {
  const [activeTab, setActiveTab] = useState("structured");
  const [copied, setCopied] = useState(false);

  if (!isOpen || !revision) return null;

  let rawData = revision.versionData;
  if (typeof rawData === "string") {
    try {
      rawData = JSON.parse(rawData);
    } catch (e) {}
  }
  if (rawData && typeof rawData === "object" && rawData.versionData && typeof rawData.versionData === "object") {
    rawData = rawData.versionData;
  }

  // If rawData has no document fields, fallback to revision itself
  const hasUserKeys = (obj) =>
    obj && typeof obj === "object" && Object.keys(obj).some((k) => !SYSTEM_KEYS.has(k));

  if (!hasUserKeys(rawData)) {
    rawData = revision;
  }

  const allEntries = (rawData && typeof rawData === "object")
    ? Object.entries(rawData).filter(([key]) => !SYSTEM_KEYS.has(key))
    : [];

  const formattedDate = revision.createdAt
    ? format(parseISO(revision.createdAt), "M/d/yyyy h:mm:ss a")
    : "Unknown Date";

  const handleCopyJson = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // fallback
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: "880px", width: "95vw" }}>
        <Dialog.Header>
          <Flex justifyContent="space-between" alignItems="center" style={{ width: "100%", paddingRight: "24px" }}>
            <Flex alignItems="center" gap={2}>
              <Eye />
              <Typography variant="beta" fontWeight="bold">
                Preview Revision #{revision.versionNumber}
              </Typography>
            </Flex>
            {revision.isCurrent ? (
              <Badge style={{ backgroundColor: "#eafbe7", color: "#277c22", borderRadius: "12px" }}>
                CURRENT
              </Badge>
            ) : (
              <Badge style={{ backgroundColor: "#f0f0ff", color: "#4945ff", borderRadius: "12px" }}>
                Historic Snapshot
              </Badge>
            )}
          </Flex>
        </Dialog.Header>

        <Dialog.Body>
          <Flex direction="column" alignItems="stretch" gap={3} style={{ width: "100%" }}>
            {/* Metadata Bar */}
            <Box
              padding={3}
              background="neutral100"
              hasRadius
              style={{
                backgroundColor: "#f6f6f9",
                borderRadius: "6px",
                border: "1px solid #eaeaef",
              }}
            >
              <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap={2}>
                <Flex alignItems="center" gap={2}>
                  <Clock />
                  <Typography variant="pi" textColor="neutral600">
                    Timestamp: <Typography variant="pi" fontWeight="bold" textColor="neutral800">{formattedDate}</Typography>
                  </Typography>
                </Flex>
                <Typography variant="pi" textColor="neutral600">
                  Author: <Typography variant="pi" fontWeight="bold" textColor="neutral800">{revision.author || "Unknown"}</Typography>
                </Typography>
              </Flex>
            </Box>

            {/* View Mode Toggle & Actions */}
            <Flex justifyContent="space-between" alignItems="center" marginTop={1}>
              <Flex gap={2}>
                <Button
                  size="S"
                  variant={activeTab === "structured" ? "default" : "tertiary"}
                  onClick={() => setActiveTab("structured")}
                >
                  Document Fields ({allEntries.length})
                </Button>
                <Button
                  size="S"
                  variant={activeTab === "raw" ? "default" : "tertiary"}
                  onClick={() => setActiveTab("raw")}
                >
                  Raw JSON
                </Button>
              </Flex>

              {activeTab === "raw" && (
                <Button
                  size="S"
                  variant="secondary"
                  startIcon={copied ? <Check /> : <Duplicate />}
                  onClick={handleCopyJson}
                >
                  {copied ? "Copied!" : "Copy JSON"}
                </Button>
              )}
            </Flex>

            {/* Main Content Area */}
            {activeTab === "structured" ? (
              <Box
                style={{
                  maxHeight: "440px",
                  overflowY: "auto",
                  border: "1px solid #eaeaef",
                  borderRadius: "6px",
                }}
              >
                {allEntries.length === 0 ? (
                  <Box padding={4} style={{ textAlign: "center" }}>
                    <Typography textColor="neutral600">No content fields recorded in this revision.</Typography>
                  </Box>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #eaeaef", backgroundColor: "#fbfbfb" }}>
                        <th style={{ width: "30%", padding: "10px 14px", fontSize: "12px", color: "#666687", textAlign: "left" }}>
                          Field
                        </th>
                        <th style={{ width: "70%", padding: "10px 14px", fontSize: "12px", color: "#666687", textAlign: "left" }}>
                          Value in this Revision
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEntries.map(([key, val], idx) => {
                        const isComplex = typeof val === "object" && val !== null;
                        return (
                          <tr
                            key={key}
                            style={{
                              borderBottom: idx === allEntries.length - 1 ? "none" : "1px solid #f0f0f5",
                              backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fdfdfd",
                            }}
                          >
                            <td
                              style={{
                                padding: "10px 14px",
                                verticalAlign: isComplex ? "top" : "middle",
                                fontWeight: "600",
                                fontSize: "13px",
                                color: "#32324d",
                              }}
                            >
                              {key}
                            </td>
                            <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
                              {isComplex ? renderComplexValue(val) : renderPrimitiveValue(val)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Box>
            ) : (
              <Box
                padding={3}
                style={{
                  maxHeight: "440px",
                  overflowY: "auto",
                  backgroundColor: "#212134",
                  color: "#dcdce4",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              >
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {JSON.stringify(rawData, null, 2)}
                </pre>
              </Box>
            )}
          </Flex>
        </Dialog.Body>

        <Dialog.Footer>
          <Flex justifyContent="flex-end" style={{ width: "100%" }}>
            <Button onClick={onClose} variant="tertiary">
              Close
            </Button>
          </Flex>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default RevisionPreviewModal;
