import React, { useCallback, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Typography,
  Badge,
  Dialog,
} from "@strapi/design-system";
import { Clock } from "@strapi/icons";
import _ from "lodash";
import { useNavigate, useLocation } from "react-router-dom";
import {
  unstable_useContentManagerContext as useContentManagerContext,
  useFetchClient,
  useAuth,
} from "@strapi/strapi/admin";
import { format, parseISO } from "date-fns";

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

  const initialData = context?.initialData || context?.form?.initialData || {};
  const modifiedData = context?.modifiedData || context?.form?.modifiedData || {};
  const slug = context?.slug || context?.model;
  const documentId = context?.documentId || context?.id || initialData?.documentId;

  const currentVersionNum = Number(initialData?.versionNumber || 1);
  const currentVuid = initialData?.vuid || modifiedData?.vuid;
  const lookupId = currentVuid || documentId || initialData?.id;

  const handleOpenRevisions = async () => {
    setIsOpen(true);
    if (!lookupId || !slug) {
      setRevisionsList([
        {
          id: initialData?.id || 1,
          documentId: documentId,
          versionNumber: currentVersionNum,
          createdAt: initialData?.createdAt || new Date().toISOString(),
          author: loggedInAuthor,
        },
      ]);
      return;
    }

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
          return {
            id: v.id,
            documentId: v.documentId,
            versionNumber: Number(v.versionNumber || 1),
            createdAt: v.createdAt,
            author: authorName || loggedInAuthor,
          };
        });
        // Sort in ASCENDING order (1, 2, 3, 4...)
        setRevisionsList(formatted.sort((a, b) => a.versionNumber - b.versionNumber));
      } else {
        setRevisionsList([
          {
            id: initialData?.id || 1,
            documentId: documentId,
            versionNumber: currentVersionNum,
            createdAt: initialData?.createdAt || new Date().toISOString(),
            author: loggedInAuthor,
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setRevisionsList([
        {
          id: initialData?.id || 1,
          documentId: documentId,
          versionNumber: currentVersionNum,
          createdAt: initialData?.createdAt || new Date().toISOString(),
          author: loggedInAuthor,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevertToRevision = async (rev) => {
    const targetId = rev.documentId || rev.id;
    if (!targetId || !slug) return;

    try {
      setLoading(true);
      await post(`/content-versioning/${slug}/revert-version`, { versionId: targetId });
      setIsOpen(false);
      // Ensure page opens on the Draft tab so the user sees the restored fields
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("status", "draft");
      if (window.location.href === currentUrl.toString()) {
        window.location.reload();
      } else {
        window.location.href = currentUrl.toString();
      }
    } catch (err) {
      console.error("[Revert error]:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: isSidePanel ? "block" : "inline-block", width: isSidePanel ? "100%" : "auto" }}>
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
                            <th style={{ width: "10%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>#</th>
                            <th style={{ width: "40%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>Date</th>
                            <th style={{ width: "30%", padding: "10px 12px", fontSize: "12px", color: "#666687" }}>Author</th>
                            <th style={{ width: "20%", padding: "10px 12px", fontSize: "12px", color: "#666687", textAlign: "right" }}>Manage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revisionsList.map((rev) => {
                            const isCurrent = rev.versionNumber === currentVersionNum;
                            const formattedDate = rev.createdAt
                              ? format(parseISO(rev.createdAt), "M/d/yyyy h:mm:ss a")
                              : "";

                            return (
                              <tr
                                key={rev.versionNumber}
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
                                      Revert
                                    </Button>
                                  )}
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
    </div>
  );
};

const VersionsSidePanel = () => {
  const context = useContentManagerContext();
  const slug = context?.slug || context?.model;
  const initialData = context?.initialData || context?.form?.initialData || {};
  const currentVersionNum = Number(initialData?.versionNumber || 1);

  if (!slug || context?.isCreatingEntry) {
    return null;
  }

  return {
    title: "Revisions",
    content: (
      <Box padding={2} style={{ width: "100%" }}>
        <Flex direction="column" alignItems="stretch" gap={3}>
          <Flex justifyContent="space-between" alignItems="center">
            <Typography variant="pi" textColor="neutral600">
              Current Version
            </Typography>
            <Badge active variant="success">
              v{currentVersionNum}
            </Badge>
          </Flex>
          <Versions isSidePanel />
        </Flex>
      </Box>
    ),
  };
};

export { Versions, VersionsSidePanel };
export default VersionsSidePanel;
