import React, { useCallback, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Typography,
  Badge,
  Dialog,
} from "@strapi/design-system";
import { Clock, Eye } from "@strapi/icons";
import _ from "lodash";
import { useNavigate, useLocation } from "react-router-dom";
import {
  unstable_useContentManagerContext as useContentManagerContext,
  useFetchClient,
  useAuth,
} from "@strapi/strapi/admin";
import { format, parseISO } from "date-fns";
import RevisionPreviewModal from "./RevisionPreviewModal";

const Versions = ({ isSidePanel = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { get, post } = useFetchClient();
  const context = useContentManagerContext();

  let loggedInAuthor = "Admin";
  try {
    const currentUser = useAuth("Versions", (state) => state.user);
    if (currentUser) {
      loggedInAuthor =
        `${currentUser.firstname || ""} ${currentUser.lastname || ""}`.trim() ||
        currentUser.email ||
        "Admin";
    }
  } catch (e) {
    loggedInAuthor = "Admin";
  }

  const [isOpen, setIsOpen] = useState(false);
  const [versioningEnabled, setVersioningEnabled] = useState(true);
  const [revisionsList, setRevisionsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revertingId, setRevertingId] = useState(null);
  const [revertError, setRevertError] = useState(null);
  const [previewRevision, setPreviewRevision] = useState(null);

  const initialData = context?.initialData || context?.form?.initialData || {};
  const modifiedData = context?.modifiedData || context?.form?.modifiedData || {};

  // Robust slug & documentId extraction with URL fallback
  const pathname = window?.location?.pathname || location?.pathname || "";
  let extractedSlug = context?.slug || context?.model;
  let extractedDocId = context?.documentId || context?.id || initialData?.documentId;

  if (!extractedSlug || !extractedDocId) {
    const matchCol = pathname.match(/\/content-manager\/collection-types\/([^/]+)(?:\/([^/?#]+))?/);
    if (matchCol) {
      if (!extractedSlug) extractedSlug = matchCol[1];
      if (!extractedDocId) extractedDocId = matchCol[2];
    } else {
      const matchSingle = pathname.match(/\/content-manager\/single-types\/([^/?#]+)/);
      if (matchSingle && !extractedSlug) {
        extractedSlug = matchSingle[1];
      }
    }
  }

  const slug = extractedSlug;
  const documentId = extractedDocId;

  const currentVuid = initialData?.vuid || modifiedData?.vuid;
  const lookupId = currentVuid || documentId || initialData?.id;

  const [activeVersionNum, setActiveVersionNum] = useState(
    initialData?.versionNumber ? Number(initialData.versionNumber) : null
  );

  const fetchVersions = useCallback(async () => {
    if (!lookupId || !slug) return;
    try {
      setLoading(true);
      const res = await get(`/content-versioning/${slug}/${lookupId}/versions`);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        const formatted = res.data.map((v) => {
          const authorName = v.createdBy
            ? `${v.createdBy.firstname || ""} ${v.createdBy.lastname || ""}`.trim() || v.createdBy.email
            : v.updatedBy
            ? `${v.updatedBy.firstname || ""} ${v.updatedBy.lastname || ""}`.trim() || v.updatedBy.email
            : loggedInAuthor;
          const hasKeys = (obj) => obj && typeof obj === "object" && Object.keys(obj).length > 0;
          const currentData = {
            ...(hasKeys(v.versionData) ? v.versionData : (v || {})),
            ...(hasKeys(initialData) ? initialData : {}),
            ...(hasKeys(modifiedData) ? modifiedData : {}),
          };

          return {
            ...v,
            id: v.id,
            documentId: v.documentId,
            versionNumber: Number(v.versionNumber || 1),
            createdAt: v.createdAt,
            author: authorName || loggedInAuthor,
            isCurrent: Boolean(v.isCurrent),
            versionData: v.isCurrent ? currentData : (v.versionData || v),
          };
        });
        const sorted = formatted.sort((a, b) => a.versionNumber - b.versionNumber);
        setRevisionsList(sorted);

        const currentActiveRev = sorted.find((r) => r.isCurrent) || sorted[sorted.length - 1];
        if (currentActiveRev) {
          setActiveVersionNum(currentActiveRev.versionNumber);
        }
      }
    } catch (err) {
      console.error("[fetchVersions error]:", err);
    } finally {
      setLoading(false);
    }
  }, [get, slug, lookupId, loggedInAuthor]);

  React.useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleOpenRevisions = async () => {
    setIsOpen(true);
    setRevertError(null);
    await fetchVersions();
  };

  const handleRevertToRevision = async (rev) => {
    const targetId = rev.documentId || rev.id;
    if (!targetId || !slug) {
      alert("Unable to revert: missing content-type or revision identifier.");
      return;
    }

    try {
      setRevertingId(targetId);
      setRevertError(null);
      const res = await post(`/content-versioning/${slug}/revert-version`, {
        versionId: targetId,
        currentDocumentId: documentId,
        versionNumber: rev.versionNumber,
      });

      if (res?.data?.ok || res?.status === 200) {
        setIsOpen(false);
        // Reload current document page so Content Manager re-fetches and renders the restored draft data
        window.location.reload();
      } else {
        throw new Error(res?.data?.message || "Revert did not complete successfully");
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "An error occurred while reverting";
      console.error("[Revert error]:", err);
      setRevertError(errMsg);
      alert(`Revert failed: ${errMsg}`);
    } finally {
      setRevertingId(null);
    }
  };

  return (
    <div style={{ display: isSidePanel ? "block" : "inline-block", width: isSidePanel ? "100%" : "auto" }}>
      {isSidePanel && (
        <Flex justifyContent="space-between" alignItems="center" marginBottom={3}>
          <Typography variant="pi" textColor="neutral600">
            Current Version
          </Typography>
          <Badge active variant="success">
            v{activeVersionNum || initialData?.versionNumber || 1}
          </Badge>
        </Flex>
      )}

      {isSidePanel ? (
        <Button
          variant="secondary"
          startIcon={<Clock />}
          onClick={handleOpenRevisions}
          fullWidth
          size="S"
        >
          View Revisions
        </Button>
      ) : (
        <Button
          variant="tertiary"
          startIcon={<Clock />}
          onClick={handleOpenRevisions}
          style={{ height: "32px", fontSize: "13px" }}
        >
          Revisions
        </Button>
      )}

      {isOpen && (
        <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
          <Dialog.Content style={{ maxWidth: "800px", width: "90vw" }}>
            <Dialog.Header>Revisions History</Dialog.Header>
            <Dialog.Body>
              <Flex direction="column" alignItems="stretch" gap={4} style={{ width: "100%" }}>
                {revertError && (
                  <Box
                    padding={3}
                    background="danger100"
                    borderColor="danger200"
                    hasRadius
                    style={{ border: "1px solid #f87272", borderRadius: "4px", backgroundColor: "#fee2e2" }}
                  >
                    <Typography textColor="danger700" fontWeight="bold" variant="pi">
                      {revertError}
                    </Typography>
                  </Box>
                )}
                {/* Toggle Switch */}
                <Box style={{ width: "100%" }}>
                  <Flex justifyContent="space-between" alignItems="center" marginBottom={1}>
                    <Typography variant="beta" fontWeight="bold" textColor="neutral800">
                      Enable entry revisions? <Typography variant="pi" textColor="neutral500">(versioning_enabled)</Typography>
                    </Typography>
                    <label style={{ position: "relative", display: "inline-block", width: "40px", height: "22px" }}>
                      <input
                        type="checkbox"
                        checked={versioningEnabled}
                        onChange={(e) => setVersioningEnabled(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          cursor: "pointer",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: versioningEnabled ? "#4945ff" : "#dcdce4",
                          transition: ".2s",
                          borderRadius: "22px",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            height: "16px",
                            width: "16px",
                            left: versioningEnabled ? "21px" : "3px",
                            bottom: "3px",
                            backgroundColor: "white",
                            transition: ".2s",
                            borderRadius: "50%",
                          }}
                        />
                      </span>
                    </label>
                  </Flex>
                  <Typography variant="pi" textColor="neutral600">
                    When enabled, you can store up to 10 revisions of this entry.
                  </Typography>
                </Box>

                {/* Revisions Table */}
                {versioningEnabled && (
                  <Box marginTop={2} style={{ width: "100%" }}>
                    <Typography variant="delta" fontWeight="bold" textColor="neutral800">
                      Revisions <Typography variant="pi" textColor="neutral500">(revisions)</Typography>
                    </Typography>

                    <Box marginTop={3} style={{ width: "100%", overflowX: "auto" }}>
                      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", textAlign: "left" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #eaeaef" }}>
                            <th style={{ width: "8%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>#</th>
                            <th style={{ width: "36%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>Date</th>
                            <th style={{ width: "26%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>Author</th>
                            <th style={{ width: "30%", padding: "10px 12px", fontSize: "12px", color: "#666687", textAlign: "right" }}>Manage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revisionsList.map((rev, index) => {
                            const isCurrent =
                              rev.isCurrent !== undefined
                                ? rev.isCurrent
                                : index === revisionsList.length - 1;
                            const formattedDate = rev.createdAt
                              ? format(parseISO(rev.createdAt), "M/d/yyyy h:mm:ss a")
                              : "";

                            return (
                              <tr
                                key={rev.id || rev.versionNumber}
                                style={{
                                  borderBottom: "1px solid #f6f6f9",
                                  height: "44px",
                                }}
                              >
                                <td style={{ padding: "8px 12px", fontSize: "13px", color: "#4945ff" }}>
                                  {rev.versionNumber}
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: "13px", color: "#4945ff" }}>
                                  {formattedDate}
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: "13px", color: "#4945ff" }}>
                                  {rev.author}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                  <Flex gap={2} justifyContent="flex-end" alignItems="center">
                                    <Button
                                      variant="tertiary"
                                      size="S"
                                      startIcon={<Eye />}
                                      onClick={() => setPreviewRevision(rev)}
                                      style={{
                                        padding: "2px 8px",
                                        fontSize: "12px",
                                      }}
                                    >
                                      Preview
                                    </Button>
                                    {isCurrent ? (
                                      <Badge
                                        style={{
                                          backgroundColor: "#eafbe7",
                                          color: "#277c22",
                                          borderRadius: "12px",
                                          padding: "4px 12px",
                                          border: "1px solid #c0ebd0",
                                          fontWeight: "600",
                                        }}
                                      >
                                        CURRENT
                                      </Badge>
                                    ) : (
                                      <Button
                                        variant="secondary"
                                        size="S"
                                        loading={revertingId === (rev.documentId || rev.id)}
                                        disabled={Boolean(revertingId)}
                                        onClick={() => handleRevertToRevision(rev)}
                                        style={{
                                          backgroundColor: "#ffffff",
                                          border: "1px solid #4945ff",
                                          color: "#4945ff",
                                          padding: "2px 12px",
                                          fontSize: "12px",
                                          fontWeight: "600",
                                        }}
                                      >
                                        {revertingId === (rev.documentId || rev.id) ? "Reverting..." : "Revert"}
                                      </Button>
                                    )}
                                  </Flex>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Box>
                  </Box>
                )}
              </Flex>
            </Dialog.Body>
            <Dialog.Footer>
              <Button onClick={() => setIsOpen(false)} variant="tertiary">
                Close
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {previewRevision && (
        <RevisionPreviewModal
          isOpen={Boolean(previewRevision)}
          onClose={() => setPreviewRevision(null)}
          revision={previewRevision}
        />
      )}
    </div>
  );
};

const VersionsSidePanel = () => {
  const context = useContentManagerContext();
  const slug = context?.slug || context?.model;

  if (!slug || context?.isCreatingEntry) {
    return null;
  }

  return {
    title: "Revisions",
    content: (
      <Box padding={2} style={{ width: "100%" }}>
        <Versions isSidePanel />
      </Box>
    ),
  };
};

export { Versions, VersionsSidePanel };
export default VersionsSidePanel;
