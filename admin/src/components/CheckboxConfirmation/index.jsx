import React, { useState } from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { useIntl } from "react-intl";
import { Checkbox, Dialog, Typography, Flex, Button } from "@strapi/design-system";
import { WarningCircle } from "@strapi/icons";
import { getTrad } from "../../utils";

const TextAlignTypography = styled(Typography)`
  text-align: center;
`;

const CheckboxConfirmation = (asd) => {
  const { description, isCreating, intlLabel, name, onChange, value } = asd;
  const { formatMessage } = useIntl();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (value) => {
    if (isCreating || value) {
      return onChange({ target: { name, value, type: "checkbox" } });
    }

    if (!value) {
      return setIsOpen(true);
    }

    return null;
  };

  const handleConfirm = () => {
    onChange({ target: { name, value: false, type: "checkbox" } });
    setIsOpen(false);
  };

  const handleToggle = () => setIsOpen((prev) => !prev);

  const label = intlLabel.id
    ? formatMessage(
        { id: intlLabel.id, defaultMessage: intlLabel.defaultMessage },
        { ...intlLabel.values }
      )
    : name;

  const hint = description
    ? formatMessage(
        { id: description.id, defaultMessage: description.defaultMessage },
        { ...description.values }
      )
    : "";

  return (
    <>
      <Checkbox
        hint={hint}
        id={name}
        name={name}
        onValueChange={handleChange}
        value={value}
        type="checkbox"
      >
        {label}
      </Checkbox>
      {isOpen && (
        <Dialog.Root open={isOpen} onOpenChange={handleToggle}>
          <Dialog.Content>
            <Dialog.Header>Confirmation</Dialog.Header>
            <Dialog.Body icon={<WarningCircle />}>
              <Flex direction="column" alignItems="stretch" gap={2}>
                <Flex justifyContent="center">
                  <TextAlignTypography id="confirm-description">
                    {formatMessage({
                      id: getTrad("CheckboxConfirmation.Modal.content"),
                      defaultMessage:
                        "Disabling versioning will engender the deletion of all your content but the latest versions.",
                    })}
                  </TextAlignTypography>
                </Flex>
                <Flex justifyContent="center">
                  <Typography fontWeight="semiBold" id="confirm-description">
                    {formatMessage({
                      id: getTrad("CheckboxConfirmation.Modal.body"),
                      defaultMessage: "Do you want to disable it?",
                    })}
                  </Typography>
                </Flex>
              </Flex>
            </Dialog.Body>
            <Dialog.Footer
              startAction={
                <Button onClick={handleToggle} variant="tertiary">
                  {formatMessage({
                    id: "components.popUpWarning.button.cancel",
                    defaultMessage: "No, cancel",
                  })}
                </Button>
              }
              endAction={
                <Button variant="danger-light" onClick={handleConfirm}>
                  {formatMessage({
                    id: getTrad("CheckboxConfirmation.Modal.button-confirm"),
                    defaultMessage: "Yes, disable",
                  })}
                </Button>
              }
            />
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  );
};

CheckboxConfirmation.defaultProps = {
  description: null,
  isCreating: false,
};

CheckboxConfirmation.propTypes = {
  description: PropTypes.shape({
    id: PropTypes.string.isRequired,
    defaultMessage: PropTypes.string.isRequired,
    values: PropTypes.object,
  }),
  intlLabel: PropTypes.shape({
    id: PropTypes.string.isRequired,
    defaultMessage: PropTypes.string.isRequired,
    values: PropTypes.object,
  }).isRequired,
  isCreating: PropTypes.bool,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  value: PropTypes.bool.isRequired,
};

export default CheckboxConfirmation;
