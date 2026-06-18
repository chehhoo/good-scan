package com.cccmbiz.domain;

import jakarta.persistence.*;
import java.sql.Date;
import java.util.Objects;

@Entity
public class Event {

    @Id
    @Column(name = "id")
    private int id;

    @Column(name = "uid")                         private String uid;
    @Column(name = "name_cn")                     private String nameCn;
    @Column(name = "name_en")                     private String nameEn;
    @Column(name = "description_cn")              private String descriptionCn;
    @Column(name = "description_en")              private String descriptionEn;
    @Column(name = "stripe_descriptor")           private String stripeDescriptor;
    @Column(name = "flyer")                       private String flyer;
    @Column(name = "link")                        private String link;
    @Column(name = "location")                    private String location;
    @Column(name = "address")                     private String address;
    @Column(name = "city")                        private String city;
    @Column(name = "state")                       private String state;
    @Column(name = "zipcode")                     private String zipcode;
    @Column(name = "deadline")                    private Date deadline;
    @Column(name = "start_date")                  private Date startDate;
    @Column(name = "end_date")                    private Date endDate;
    @Column(name = "capacity")                    private short capacity;
    @Column(name = "option")                      private short option;
    @Column(name = "notify_email")                private String notifyEmail;
    @Column(name = "status")                      private byte status;
    @Column(name = "contact_info")                private String contactInfo;
    @Column(name = "closed_message")              private String closedMessage;
    @Column(name = "online_payment")              private byte onlinePayment;
    @Column(name = "church_sponsor")              private byte churchSponsor;
    @Column(name = "allow_guest")                 private byte allowGuest;
    @Column(name = "has_group")                   private byte hasGroup;
    @Column(name = "use_zoom")                    private byte useZoom;
    @Column(name = "group_leader_option_id")      private Integer groupLeaderOptionId;
    @Column(name = "group_leader_option_value")   private Integer groupLeaderOptionValue;
    @Column(name = "join_email_date")             private Date joinEmailDate;
    @Column(name = "admin_user_id")               private String adminUserId;
    @Column(name = "event_category_id")           private Integer eventCategoryId;

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }
    public String getNameCn() { return nameCn; }
    public void setNameCn(String nameCn) { this.nameCn = nameCn; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String nameEn) { this.nameEn = nameEn; }
    public String getDescriptionCn() { return descriptionCn; }
    public void setDescriptionCn(String v) { this.descriptionCn = v; }
    public String getDescriptionEn() { return descriptionEn; }
    public void setDescriptionEn(String v) { this.descriptionEn = v; }
    public String getStripeDescriptor() { return stripeDescriptor; }
    public void setStripeDescriptor(String v) { this.stripeDescriptor = v; }
    public String getFlyer() { return flyer; }
    public void setFlyer(String flyer) { this.flyer = flyer; }
    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getZipcode() { return zipcode; }
    public void setZipcode(String zipcode) { this.zipcode = zipcode; }
    public Date getDeadline() { return deadline; }
    public void setDeadline(Date deadline) { this.deadline = deadline; }
    public Date getStartDate() { return startDate; }
    public void setStartDate(Date startDate) { this.startDate = startDate; }
    public Date getEndDate() { return endDate; }
    public void setEndDate(Date endDate) { this.endDate = endDate; }
    public short getCapacity() { return capacity; }
    public void setCapacity(short capacity) { this.capacity = capacity; }
    public short getOption() { return option; }
    public void setOption(short option) { this.option = option; }
    public String getNotifyEmail() { return notifyEmail; }
    public void setNotifyEmail(String notifyEmail) { this.notifyEmail = notifyEmail; }
    public byte getStatus() { return status; }
    public void setStatus(byte status) { this.status = status; }
    public String getContactInfo() { return contactInfo; }
    public void setContactInfo(String v) { this.contactInfo = v; }
    public String getClosedMessage() { return closedMessage; }
    public void setClosedMessage(String v) { this.closedMessage = v; }
    public byte getOnlinePayment() { return onlinePayment; }
    public void setOnlinePayment(byte v) { this.onlinePayment = v; }
    public byte getChurchSponsor() { return churchSponsor; }
    public void setChurchSponsor(byte v) { this.churchSponsor = v; }
    public byte getAllowGuest() { return allowGuest; }
    public void setAllowGuest(byte v) { this.allowGuest = v; }
    public byte getHasGroup() { return hasGroup; }
    public void setHasGroup(byte v) { this.hasGroup = v; }
    public byte getUseZoom() { return useZoom; }
    public void setUseZoom(byte v) { this.useZoom = v; }
    public Integer getGroupLeaderOptionId() { return groupLeaderOptionId; }
    public void setGroupLeaderOptionId(Integer v) { this.groupLeaderOptionId = v; }
    public Integer getGroupLeaderOptionValue() { return groupLeaderOptionValue; }
    public void setGroupLeaderOptionValue(Integer v) { this.groupLeaderOptionValue = v; }
    public Date getJoinEmailDate() { return joinEmailDate; }
    public void setJoinEmailDate(Date v) { this.joinEmailDate = v; }
    public String getAdminUserId() { return adminUserId; }
    public void setAdminUserId(String v) { this.adminUserId = v; }
    public Integer getEventCategoryId() { return eventCategoryId; }
    public void setEventCategoryId(Integer v) { this.eventCategoryId = v; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        return id == ((Event) o).id;
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
